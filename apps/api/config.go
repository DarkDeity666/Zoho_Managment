package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"schooldesk/packages/schema"
	"strconv"
	"strings"
	"time"
)

type Field struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Type     string   `json:"type"`
	Ref      string   `json:"ref"`
	Required bool     `json:"required"`
	Readonly bool     `json:"readonly"`
	Unique   bool     `json:"unique"`
	Options  []string `json:"options"`
}
type Module struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	Singular string  `json:"singular"`
	Fields   []Field `json:"fields"`
}

var modules []Module
var moduleByKey = map[string]Module{}

func init() {
	if err := json.Unmarshal(schema.JSON, &modules); err != nil {
		panic(err)
	}
	for _, m := range modules {
		moduleByKey[m.Key] = m
	}
}

type Config struct {
	Mode, Addr, Origin, AdminEmail, AdminPassword, ParentPassword, DataFile, School, AccountsURL, APIURL, ClientID, ClientSecret, RefreshToken, WebformURL string
	Secure                                                                                                                                                 bool
	Location                                                                                                                                               *time.Location
	AlertThreshold                                                                                                                                         float64
}

func env(k, d string) string {
	if v, ok := os.LookupEnv(k); ok {
		return v
	}
	return d
}
func loadEnv(path string) error {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			return fmt.Errorf("invalid .env line")
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if len(v) > 1 && ((v[0] == 34 && v[len(v)-1] == 34) || (v[0] == 39 && v[len(v)-1] == 39)) {
			v = v[1 : len(v)-1]
		}
		if _, ok := os.LookupEnv(k); !ok {
			os.Setenv(k, v)
		}
	}
	return scanner.Err()
}
func readConfig() (Config, error) {
	if err := loadEnv(".env"); err != nil {
		return Config{}, err
	}
	loc, err := time.LoadLocation(env("SCHOOL_TIMEZONE", "Asia/Kolkata"))
	if err != nil {
		return Config{}, err
	}
	threshold, err := strconv.ParseFloat(env("ATTENDANCE_ALERT_THRESHOLD", "75"), 64)
	if err != nil || threshold < 0 || threshold > 100 {
		return Config{}, fmt.Errorf("invalid attendance threshold")
	}
	c := Config{Mode: env("APP_MODE", "demo"), Addr: env("APP_ADDR", "127.0.0.1:8080"), Origin: env("APP_ORIGIN", "http://localhost:5173"), AdminEmail: env("APP_ADMIN_EMAIL", "admin@school.local"), AdminPassword: os.Getenv("APP_ADMIN_PASSWORD"), ParentPassword: env("DEMO_PARENT_PASSWORD", "parent-demo-2026"), DataFile: env("DEMO_DATA_FILE", "data/demo.json"), School: env("SCHOOL_NAME", "Greenfield Academy"), Secure: env("APP_SECURE_COOKIE", "false") == "true", Location: loc, AlertThreshold: threshold, AccountsURL: env("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.in"), APIURL: env("ZOHO_API_URL", "https://www.zohoapis.in"), ClientID: os.Getenv("ZOHO_CLIENT_ID"), ClientSecret: os.Getenv("ZOHO_CLIENT_SECRET"), RefreshToken: os.Getenv("ZOHO_REFRESH_TOKEN"), WebformURL: os.Getenv("ZOHO_WEBFORM_EMBED_URL")}
	if len(c.AdminPassword) < 16 {
		return c, fmt.Errorf("APP_ADMIN_PASSWORD must be at least 16 characters; run npm run setup and inspect .env")
	}
	if c.Mode != "demo" && c.Mode != "zoho" {
		return c, fmt.Errorf("APP_MODE must be demo or zoho")
	}
	if c.Mode == "zoho" && (c.ClientID == "" || c.ClientSecret == "" || c.RefreshToken == "") {
		return c, fmt.Errorf("Zoho credentials missing; see docs/credentials.md")
	}
	return c, nil
}
