package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Record map[string]any
type Dataset map[string][]Record
type Store interface {
	List(context.Context, string) ([]Record, error)
	Get(context.Context, string, string) (Record, error)
	Create(context.Context, string, Record) (Record, error)
	Update(context.Context, string, string, Record) (Record, error)
}

var errNotFound = errors.New("record not found")

func id() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func clone(r Record) Record {
	b, _ := json.Marshal(r)
	var out Record
	json.Unmarshal(b, &out)
	return out
}
func str(r Record, k string) string {
	v := r[k]
	if v == nil {
		return ""
	}
	if m, ok := v.(map[string]any); ok {
		return fmt.Sprint(m["id"])
	}
	if m, ok := v.(Record); ok {
		return fmt.Sprint(m["id"])
	}
	return fmt.Sprint(v)
}
func num(r Record, k string) float64 {
	switch v := r[k].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		n, _ := v.Float64()
		return n
	}
	return 0
}
func matching(rows []Record, key, value string) []Record {
	out := []Record{}
	for _, r := range rows {
		if str(r, key) == value {
			out = append(out, r)
		}
	}
	return out
}
func find(rows []Record, recordID string) Record {
	for _, r := range rows {
		if str(r, "id") == recordID {
			return r
		}
	}
	return Record{}
}

type FileStore struct {
	mu   sync.Mutex
	Path string
	Data Dataset
}

func NewFileStore(path string, seed Dataset) (*FileStore, error) {
	s := &FileStore{Path: path, Data: seed}
	b, err := os.ReadFile(path)
	if err == nil {
		if err = json.Unmarshal(b, &s.Data); err != nil {
			return nil, fmt.Errorf("demo data is invalid: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	} else if err = s.persist(); err != nil {
		return nil, err
	}
	return s, nil
}
func (s *FileStore) persist() error {
	if s.Path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.Data, "", "  ")
	if err != nil {
		return err
	}
	temp := s.Path + ".tmp"
	if err = os.WriteFile(temp, b, 0600); err != nil {
		return err
	}
	return os.Rename(temp, s.Path)
}
func (s *FileStore) List(_ context.Context, module string) ([]Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []Record{}
	for _, r := range s.Data[module] {
		out = append(out, clone(r))
	}
	return out, nil
}
func (s *FileStore) Get(ctx context.Context, module, recordID string) (Record, error) {
	rows, _ := s.List(ctx, module)
	r := find(rows, recordID)
	if len(r) == 0 {
		return nil, errNotFound
	}
	return r, nil
}
func (s *FileStore) Create(_ context.Context, module string, r Record) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r = clone(r)
	r["id"] = id()
	for _, f := range moduleByKey[module].Fields {
		if f.Unique && str(r, f.Key) != "" {
			for _, old := range s.Data[module] {
				if strings.EqualFold(str(old, f.Key), str(r, f.Key)) {
					return nil, fmt.Errorf("duplicate %s", f.Label)
				}
			}
		}
	}
	before := s.Data[module]
	s.Data[module] = append(s.Data[module], r)
	if err := s.persist(); err != nil {
		s.Data[module] = before
		return nil, err
	}
	return clone(r), nil
}
func (s *FileStore) Update(_ context.Context, module, recordID string, r Record) (Record, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, old := range s.Data[module] {
		if str(old, "id") != recordID {
			continue
		}
		next := clone(old)
		for k, v := range r {
			next[k] = v
		}
		for _, f := range moduleByKey[module].Fields {
			if f.Unique && str(next, f.Key) != "" {
				for _, other := range s.Data[module] {
					if str(other, "id") != recordID && strings.EqualFold(str(other, f.Key), str(next, f.Key)) {
						return nil, fmt.Errorf("duplicate %s", f.Label)
					}
				}
			}
		}
		s.Data[module][i] = next
		if err := s.persist(); err != nil {
			s.Data[module][i] = old
			return nil, err
		}
		return clone(next), nil
	}
	return nil, errNotFound
}
