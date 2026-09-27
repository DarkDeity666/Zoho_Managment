package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type ZohoStore struct {
	Config  Config
	Client  *http.Client
	mu      sync.Mutex
	token   string
	expires time.Time
}

func (z *ZohoStore) accessToken(ctx context.Context) (string, error) {
	z.mu.Lock()
	defer z.mu.Unlock()
	if time.Now().Before(z.expires) {
		return z.token, nil
	}
	values := url.Values{"client_id": {z.Config.ClientID}, "client_secret": {z.Config.ClientSecret}, "refresh_token": {z.Config.RefreshToken}, "grant_type": {"refresh_token"}}
	req, err := http.NewRequestWithContext(ctx, "POST", z.Config.AccountsURL+"/oauth/v2/token", strings.NewReader(values.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := z.Client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Zoho token service unavailable")
	}
	defer res.Body.Close()
	var body struct {
		AccessToken string `json:"access_token"`
		Expires     int    `json:"expires_in"`
		Error       string `json:"error"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&body) != nil || res.StatusCode != 200 || body.AccessToken == "" {
		return "", fmt.Errorf("Zoho OAuth failed; check region, scopes and refresh token")
	}
	z.token = body.AccessToken
	z.expires = time.Now().Add(time.Duration(body.Expires-60) * time.Second)
	return z.token, nil
}
func (z *ZohoStore) request(ctx context.Context, method, path string, input any) (Record, error) {
	token, err := z.accessToken(ctx)
	if err != nil {
		return nil, err
	}
	var b []byte
	if input != nil {
		b, err = json.Marshal(input)
		if err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, z.Config.APIURL+"/crm/v8/"+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Zoho-oauthtoken "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := z.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Zoho CRM request failed; no automatic write retry was attempted")
	}
	defer res.Body.Close()
	if res.StatusCode == 204 {
		return Record{"data": []any{}}, nil
	}
	var out Record
	if err = json.NewDecoder(io.LimitReader(res.Body, 16<<20)).Decode(&out); err != nil {
		return nil, fmt.Errorf("invalid Zoho response")
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("Zoho CRM error %s (HTTP %d)", str(out, "code"), res.StatusCode)
	}
	return out, nil
}
func rowsFrom(body Record) []Record {
	out := []Record{}
	for _, v := range asList(body["data"]) {
		if r, ok := v.(map[string]any); ok {
			out = append(out, Record(r))
		}
	}
	return out
}
func asList(v any) []any { r, _ := v.([]any); return r }
func (z *ZohoStore) List(ctx context.Context, module string) ([]Record, error) {
	out := []Record{}
	pageToken := ""
	fields := []string{"id"}
	for _, f := range moduleByKey[module].Fields {
		fields = append(fields, f.Key)
	}
	for page := 1; page <= 500; page++ {
		q := url.Values{"per_page": {"200"}, "fields": {strings.Join(fields, ",")}}
		if pageToken != "" {
			q.Set("page_token", pageToken)
		} else {
			q.Set("page", strconv.Itoa(page))
		}
		body, err := z.request(ctx, "GET", module+"?"+q.Encode(), nil)
		if err != nil {
			return nil, err
		}
		out = append(out, rowsFrom(body)...)
		info, _ := body["info"].(map[string]any)
		if info == nil || info["more_records"] != true {
			return out, nil
		}
		pageToken, _ = info["next_page_token"].(string)
		if page >= 10 && pageToken == "" {
			return nil, fmt.Errorf("Zoho pagination token missing; refusing a partial dataset")
		}
	}
	return nil, fmt.Errorf("dataset exceeds interactive limit; use CRM reports or bulk APIs")
}
func (z *ZohoStore) Get(ctx context.Context, module, recordID string) (Record, error) {
	body, err := z.request(ctx, "GET", module+"/"+url.PathEscape(recordID), nil)
	if err != nil {
		return nil, err
	}
	rows := rowsFrom(body)
	if len(rows) == 0 {
		return nil, errNotFound
	}
	return rows[0], nil
}
func (z *ZohoStore) write(ctx context.Context, method, module string, r Record) (Record, error) {
	payload := clone(r)
	delete(payload, "Created_Time")
	for _, f := range moduleByKey[module].Fields {
		if f.Type == "lookup" && str(payload, f.Key) != "" {
			payload[f.Key] = Record{"id": str(payload, f.Key)}
		}
	}
	body, err := z.request(ctx, method, module, Record{"data": []Record{payload}, "trigger": []string{"workflow"}})
	if err != nil {
		return nil, err
	}
	rows := rowsFrom(body)
	if len(rows) != 1 || str(rows[0], "status") != "success" {
		code := "UNKNOWN"
		if len(rows) > 0 {
			code = str(rows[0], "code")
		}
		return nil, fmt.Errorf("Zoho write failed: %s", code)
	}
	details, _ := rows[0]["details"].(map[string]any)
	return z.Get(ctx, module, fmt.Sprint(details["id"]))
}
func (z *ZohoStore) Create(ctx context.Context, module string, r Record) (Record, error) {
	return z.write(ctx, "POST", module, r)
}
func (z *ZohoStore) Update(ctx context.Context, module, recordID string, r Record) (Record, error) {
	r = clone(r)
	r["id"] = recordID
	return z.write(ctx, "PUT", module, r)
}
