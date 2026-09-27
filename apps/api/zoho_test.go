package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestZohoTokenCacheAndPagination(t *testing.T) {
	tokens, pages := 0, 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/oauth/v2/token" {
			tokens++
			r.ParseForm()
			if r.Form.Get("grant_type") != "refresh_token" || r.Form.Get("refresh_token") != "test-refresh" {
				t.Error("wrong OAuth grant")
			}
			fmt.Fprint(w, `{"access_token":"test-token","expires_in":3600}`)
			return
		}
		if r.Header.Get("Authorization") != "Zoho-oauthtoken test-token" {
			t.Error("missing CRM authorization")
		}
		if r.URL.Query().Get("fields") == "" {
			t.Error("missing explicit API fields")
		}
		pages++
		if pages == 1 {
			fmt.Fprint(w, `{"data":[{"id":"one","Name":"First"}],"info":{"more_records":true,"next_page_token":"opaque"}}`)
		} else {
			if r.URL.Query().Get("page_token") != "opaque" {
				t.Error("pagination token not used")
			}
			fmt.Fprint(w, `{"data":[{"id":"two","Name":"Second"}],"info":{"more_records":false}}`)
		}
	}))
	defer upstream.Close()
	store := &ZohoStore{Config: Config{AccountsURL: upstream.URL, APIURL: upstream.URL, ClientID: "client", ClientSecret: "test-secret", RefreshToken: "test-refresh"}, Client: upstream.Client()}
	records, err := store.List(context.Background(), "Students")
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || tokens != 1 || pages != 2 {
		t.Fatalf("records=%d tokens=%d pages=%d", len(records), tokens, pages)
	}
}
func TestZohoRejectsPerRecordErrorOnHTTP207(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var body Record
			json.NewDecoder(r.Body).Decode(&body)
			record := rowsFrom(body)[0]
			if ref, ok := record["Enrollment"].(map[string]any); !ok || ref["id"] != "123" {
				t.Error("lookup was not encoded as a CRM reference")
			}
			w.WriteHeader(207)
			fmt.Fprint(w, `{"data":[{"status":"error","code":"DUPLICATE_DATA","message":"private upstream text"}]}`)
		}
	}))
	defer upstream.Close()
	store := &ZohoStore{Config: Config{APIURL: upstream.URL}, Client: upstream.Client(), token: "test", expires: time.Now().Add(time.Hour)}
	_, err := store.Create(context.Background(), "Attendance", Record{"Enrollment": "123", "Status": "Present"})
	if err == nil || !strings.Contains(err.Error(), "DUPLICATE_DATA") {
		t.Fatal("record-level error ignored", err)
	}
	if strings.Contains(err.Error(), "private") {
		t.Fatal("upstream message leaked")
	}
}
func TestZohoEmptyModuleIsNotAnError(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer upstream.Close()
	store := &ZohoStore{Config: Config{APIURL: upstream.URL}, Client: upstream.Client(), token: "test", expires: time.Now().Add(time.Hour)}
	records, err := store.List(context.Background(), "Students")
	if err != nil || len(records) != 0 {
		t.Fatal("empty module should be a valid result", err)
	}
}
