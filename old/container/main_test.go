package main

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestSanitizeID(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"":              "main",
		"main":          "main",
		"Tab-ABC_123":   "tab-abc_123",
		"../../escape":  "escape",
		"has spaces":    "hasspaces",
		"___":           "main",
		"dots.not-okay": "dotsnot-okay",
	}

	for input, want := range cases {
		if got := sanitizeID(input, defaultSessionID); got != want {
			t.Fatalf("sanitizeID(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSessionIDFromRequest(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest("GET", "/ws/terminal?sessionId=query-tab", nil)
	req.Header.Set("X-Session-Id", "header-tab")

	if got := sessionIDFromRequest(req); got != "header-tab" {
		t.Fatalf("sessionIDFromRequest header precedence = %q, want header-tab", got)
	}

	req = httptest.NewRequest("GET", "/ws/terminal", nil)
	if got := sessionIDFromRequest(req); got != "main" {
		t.Fatalf("sessionIDFromRequest default = %q, want main", got)
	}
}

func TestTabIDFromRequest(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest("GET", "/ws/terminal?tabId=query-tab", nil)
	req.Header.Set("X-Tab-Id", "header-tab")

	if got := tabIDFromRequest(req); got != "header-tab" {
		t.Fatalf("tabIDFromRequest header precedence = %q, want header-tab", got)
	}

	req = httptest.NewRequest("GET", "/ws/terminal", nil)
	if got := tabIDFromRequest(req); got != "main" {
		t.Fatalf("tabIDFromRequest default = %q, want main", got)
	}
}

func TestTabStatePath(t *testing.T) {
	t.Parallel()

	want := filepath.Join(
		"/home/user",
		"alice",
		".cloudshell",
		"sessions",
		"session-1",
		"tabs",
		"tab-1.json",
	)

	if got := tabStatePath("alice", "session-1", "tab-1"); got != want {
		t.Fatalf("tabStatePath = %q, want %q", got, want)
	}
}
