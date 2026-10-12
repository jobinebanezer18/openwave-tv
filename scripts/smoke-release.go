// Run with: go run ./scripts/smoke-release.go -dir release
// This starts the exact packaged binary on the runner OS. No catalog or live
// stream request is needed, so upstream availability cannot mask startup bugs.
package main

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

func main() {
	dir := flag.String("dir", "release", "directory containing release archives and SHA256SUMS")
	flag.Parse()
	if err := smoke(*dir); err != nil {
		fmt.Fprintln(os.Stderr, "release smoke failed:", err)
		os.Exit(1)
	}
}

func smoke(dir string) error {
	name := "openwave-tv-" + runtime.GOOS + "-" + runtime.GOARCH
	archive := name + ".tar.gz"
	program := name
	if runtime.GOOS == "windows" {
		archive = name + ".zip"
		program += ".exe"
	}
	archivePath := filepath.Join(dir, archive)
	if err := checkSHA256(filepath.Join(dir, "SHA256SUMS"), archivePath, archive); err != nil {
		return err
	}
	work, err := os.MkdirTemp("", "openwave-release-smoke-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(work)
	binary := filepath.Join(work, program)
	if err := extractBinary(archivePath, program, binary); err != nil {
		return err
	}

	cmd := exec.Command(binary, "-no-browser", "-addr", "127.0.0.1:0")
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	cmd.Stdout = io.Discard
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start packaged binary: %w", err)
	}
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	address := make(chan string, 1)
	done := make(chan error, 1)
	go func() {
		var found bool
		scanner := bufio.NewScanner(stderr)
		urlPattern := regexp.MustCompile(`http://127\.0\.0\.1:[0-9]+`)
		for scanner.Scan() {
			line := scanner.Text()
			if !found {
				if url := urlPattern.FindString(line); url != "" {
					address <- url
					found = true
				}
			}
		}
		done <- scanner.Err()
	}()

	var base string
	select {
	case base = <-address:
	case err := <-done:
		return fmt.Errorf("binary exited before announcing its loopback URL: %v", err)
	case <-time.After(15 * time.Second):
		return errors.New("timed out waiting for loopback listener")
	}

	client := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{Proxy: nil}}
	index, err := get(client, base+"/")
	if err != nil {
		return err
	}
	if !strings.Contains(index, "<html") || !strings.Contains(index, "<script") {
		return errors.New("root route did not serve the built application HTML")
	}
	if _, err := get(client, base+"/favicon.svg"); err != nil {
		return err
	}
	asset := regexp.MustCompile(`(?:src|href)="(?:\./|/)(assets/[^" ]+)"`).FindStringSubmatch(index)
	if len(asset) < 2 {
		return errors.New("built HTML did not reference a bundled asset")
	}
	if _, err := get(client, base+"/"+asset[1]); err != nil {
		return err
	}
	fmt.Printf("smoke passed for %s: loopback HTML, favicon, and %s\n", archive, asset[1])
	return nil
}

func checkSHA256(manifestPath, archivePath, archive string) error {
	manifest, err := os.ReadFile(manifestPath)
	if err != nil {
		return err
	}
	var expected string
	for _, line := range strings.Split(string(manifest), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == archive {
			expected = fields[0]
			break
		}
	}
	if expected == "" {
		return fmt.Errorf("%s missing from SHA256SUMS", archive)
	}
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, f); err != nil {
		return err
	}
	if actual := hex.EncodeToString(hash.Sum(nil)); !strings.EqualFold(expected, actual) {
		return fmt.Errorf("SHA-256 mismatch for %s", archive)
	}
	return nil
}

func extractBinary(archivePath, name, destination string) error {
	var reader io.ReadCloser
	if strings.HasSuffix(archivePath, ".zip") {
		z, err := zip.OpenReader(archivePath)
		if err != nil {
			return err
		}
		defer z.Close()
		for _, file := range z.File {
			if file.Name == name {
				reader, err = file.Open()
				if err != nil {
					return err
				}
				break
			}
		}
	} else {
		f, err := os.Open(archivePath)
		if err != nil {
			return err
		}
		defer f.Close()
		gz, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer gz.Close()
		tr := tar.NewReader(gz)
		for {
			header, err := tr.Next()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return err
			}
			if header.Name == name && header.Typeflag == tar.TypeReg {
				reader = io.NopCloser(tr)
				break
			}
		}
	}
	if reader == nil {
		return fmt.Errorf("%s not found in %s", name, archivePath)
	}
	defer reader.Close()
	out, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0700)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, reader); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func get(client *http.Client, address string) (string, error) {
	response, err := client.Get(address)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GET %s: HTTP %d", address, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if len(body) == 0 {
		return "", fmt.Errorf("GET %s: empty body", address)
	}
	return string(body), nil
}
