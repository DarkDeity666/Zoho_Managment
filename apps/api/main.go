package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
	_ "time/tzdata"
)

type Session struct {
	Email   string    `json:"email"`
	Name    string    `json:"name"`
	Role    string    `json:"role"`
	Expires time.Time `json:"-"`
}
type rateEntry struct {
	Count int
	Until time.Time
}
type Server struct {
	service  *Service
	mu       sync.Mutex
	sessions map[string]Session
	rates    map[string]rateEntry
}

func reply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
func problem(w http.ResponseWriter, status int, err error) {
	reply(w, status, Record{"error": err.Error()})
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return fmt.Errorf("invalid request body")
	}
	if err := d.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("request must contain one JSON object")
	}
	return nil
}
func equal(a, b string) bool {
	x := sha256.Sum256([]byte(a))
	y := sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(x[:], y[:]) == 1
}
func (s *Server) user(r *http.Request) (Session, bool) {
	cookie, err := r.Cookie("schooldesk_session")
	if err != nil {
		return Session{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[cookie.Value]
	if ok && time.Now().After(session.Expires) {
		delete(s.sessions, cookie.Value)
		ok = false
	}
	return session, ok
}
func (s *Server) limited(r *http.Request) bool {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	key := host + ":" + r.URL.Path
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for k, v := range s.rates {
		if now.After(v.Until) {
			delete(s.rates, k)
		}
	}
	v := s.rates[key]
	if v.Until.IsZero() {
		v.Until = now.Add(time.Minute)
	}
	v.Count++
	s.rates[key] = v
	return v.Count > 15
}
func (s *Server) login(w http.ResponseWriter, r *http.Request, demo bool) {
	if s.limited(r) {
		problem(w, 429, fmt.Errorf("too many attempts; try again in a minute"))
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := decode(w, r, &input); err != nil {
		problem(w, 400, err)
		return
	}
	c := s.service.Config
	session := Session{Expires: time.Now().Add(8 * time.Hour)}
	if demo && c.Mode == "demo" {
		switch input.Role {
		case "staff":
			session.Email = c.AdminEmail
			session.Name = "School administrator"
			session.Role = "staff"
		case "parent":
			session.Email = "parent@school.local"
			session.Name = "Sharma family"
			session.Role = "parent"
		case "other-parent":
			session.Email = "other.parent@school.local"
			session.Name = "Patel family"
			session.Role = "parent"
		default:
			problem(w, 400, fmt.Errorf("invalid demo role"))
			return
		}
	} else if !demo && strings.EqualFold(input.Email, c.AdminEmail) && equal(input.Password, c.AdminPassword) {
		session.Email = c.AdminEmail
		session.Name = "School administrator"
		session.Role = "staff"
	} else if !demo && c.Mode == "demo" && (input.Email == "parent@school.local" || input.Email == "other.parent@school.local") && equal(input.Password, c.ParentPassword) {
		session.Email = input.Email
		session.Name = "Parent"
		session.Role = "parent"
	} else {
		problem(w, 401, fmt.Errorf("invalid sign-in details"))
		return
	}
	token := id() + id()
	s.mu.Lock()
	for k, v := range s.sessions {
		if time.Now().After(v.Expires) {
			delete(s.sessions, k)
		}
	}
	if previous, err := r.Cookie("schooldesk_session"); err == nil {
		delete(s.sessions, previous.Value)
	}
	s.sessions[token] = session
	s.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "schooldesk_session", Value: token, Path: "/", HttpOnly: true, Secure: c.Secure, SameSite: http.SameSiteStrictMode, MaxAge: 28800})
	reply(w, 200, session)
}
func (s *Server) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, Record{"status": "ok", "mode": s.service.Config.Mode})
	})
	mux.HandleFunc("GET /api/public", func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.service.Store.List(r.Context(), "Sections")
		if err != nil {
			problem(w, 502, err)
			return
		}
		sections := []Record{}
		for _, row := range rows {
			sections = append(sections, Record{"id": row["id"], "Name": row["Name"]})
		}
		reply(w, 200, Record{"school": s.service.Config.School, "mode": s.service.Config.Mode, "sections": sections, "webformURL": s.service.Config.WebformURL})
	})
	mux.HandleFunc("POST /api/login", func(w http.ResponseWriter, r *http.Request) { s.login(w, r, false) })
	mux.HandleFunc("POST /api/demo-login", func(w http.ResponseWriter, r *http.Request) {
		if s.service.Config.Mode != "demo" {
			http.NotFound(w, r)
			return
		}
		s.login(w, r, true)
	})
	mux.HandleFunc("POST /api/logout", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("schooldesk_session")
		if err == nil {
			s.mu.Lock()
			delete(s.sessions, cookie.Value)
			s.mu.Unlock()
		}
		http.SetCookie(w, &http.Cookie{Name: "schooldesk_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.service.Config.Secure, SameSite: http.SameSiteStrictMode})
		reply(w, 200, Record{"ok": true})
	})
	mux.HandleFunc("GET /api/session", func(w http.ResponseWriter, r *http.Request) {
		session, ok := s.user(r)
		if !ok {
			problem(w, 401, fmt.Errorf("sign in to continue"))
			return
		}
		reply(w, 200, session)
	})
	mux.HandleFunc("POST /api/admissions", func(w http.ResponseWriter, r *http.Request) {
		if s.limited(r) {
			problem(w, 429, fmt.Errorf("too many enquiries; try again shortly"))
			return
		}
		var input Record
		if err := decode(w, r, &input); err != nil {
			problem(w, 400, err)
			return
		}
		for k := range input {
			if !strings.Contains(",Last_Name,Parent_Name,Email,Phone,Date_of_Birth,Desired_Section,Notes,", ","+k+",") {
				problem(w, 400, fmt.Errorf("unsupported enquiry field"))
				return
			}
		}
		input["Admission_Status"] = "New"
		if _, err := s.service.Save(r.Context(), "Leads", "", input); err != nil {
			problem(w, 400, err)
			return
		}
		reply(w, 201, Record{"message": "Your enquiry has been received. Our admissions team will follow up."})
	})
	mux.HandleFunc("GET /api/workspace", func(w http.ResponseWriter, r *http.Request) {
		user, ok := s.user(r)
		if !ok {
			problem(w, 401, fmt.Errorf("sign in to continue"))
			return
		}
		d, err := s.service.dataset(r.Context())
		if err != nil {
			problem(w, 502, err)
			return
		}
		if user.Role == "parent" {
			d = parentDataset(d, user.Email)
		}
		reply(w, 200, Record{"data": d, "mode": s.service.Config.Mode, "school": s.service.Config.School, "today": s.service.today(), "alertThreshold": s.service.Config.AlertThreshold})
	})
	staff := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			user, ok := s.user(r)
			if !ok {
				problem(w, 401, fmt.Errorf("sign in to continue"))
				return
			}
			if user.Role != "staff" {
				problem(w, 403, fmt.Errorf("staff access required"))
				return
			}
			next(w, r)
		}
	}
	save := staff(func(w http.ResponseWriter, r *http.Request) {
		var input Record
		if err := decode(w, r, &input); err != nil {
			problem(w, 400, err)
			return
		}
		record, err := s.service.Save(r.Context(), r.PathValue("module"), r.PathValue("id"), input)
		if err != nil {
			problem(w, 422, err)
			return
		}
		reply(w, 200, record)
	})
	mux.HandleFunc("POST /api/records/{module}", save)
	mux.HandleFunc("PATCH /api/records/{module}/{id}", save)
	mux.HandleFunc("POST /api/admissions/{id}/confirm", staff(func(w http.ResponseWriter, r *http.Request) {
		record, err := s.service.Admit(r.Context(), r.PathValue("id"))
		if err != nil {
			problem(w, 422, err)
			return
		}
		reply(w, 200, record)
	}))
	mux.HandleFunc("POST /api/enrollments/{id}/promote", staff(func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Section string `json:"section"`
		}
		if err := decode(w, r, &input); err != nil {
			problem(w, 400, err)
			return
		}
		record, err := s.service.Promote(r.Context(), r.PathValue("id"), input.Section)
		if err != nil {
			problem(w, 422, err)
			return
		}
		reply(w, 200, record)
	}))
	mux.Handle("/", http.FileServer(http.Dir("apps/web/dist")))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		if r.Method != "GET" && r.Method != "HEAD" && r.Header.Get("Origin") != s.service.Config.Origin {
			problem(w, 403, fmt.Errorf("request origin is not allowed"))
			return
		}
		mux.ServeHTTP(w, r)
	})
}
func main() {
	config, err := readConfig()
	if err != nil {
		log.Fatal(err)
	}
	var store Store
	if config.Mode == "demo" {
		host, _, e := net.SplitHostPort(config.Addr)
		if e != nil || (host != "127.0.0.1" && host != "localhost" && host != "::1") {
			log.Fatal("demo mode must bind to loopback; it includes demo sign-in")
		}
		store, err = NewFileStore(config.DataFile, seedData(time.Now().In(config.Location)))
	} else {
		store = &ZohoStore{Config: config, Client: &http.Client{Timeout: 30 * time.Second}}
	}
	if err != nil {
		log.Fatal(err)
	}
	app := &Server{service: &Service{Store: store, Config: config}, sessions: map[string]Session{}, rates: map[string]rateEntry{}}
	server := &http.Server{Addr: config.Addr, Handler: app.handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 120 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		log.Printf("Schooldesk API listening on %s (%s mode)", config.Addr, config.Mode)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	<-signals
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	server.Shutdown(ctx)
}
