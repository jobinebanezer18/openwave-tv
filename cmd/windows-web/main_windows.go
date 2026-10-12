package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

const homeURL = "https://tv.vibeworks.in/"

func main() {
	if launchEdge() == nil {
		return
	}
	if err := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", homeURL).Start(); err != nil {
		showError("OpenWave TV could not open a browser. Install Microsoft Edge and try again.")
	}
}

func launchEdge() error {
	var locations []string
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LocalAppData")} {
		if base != "" {
			locations = append(locations, filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
		}
	}
	if path, err := exec.LookPath("msedge.exe"); err == nil {
		locations = append(locations, path)
	}
	for _, path := range locations {
		if _, err := os.Stat(path); err == nil {
			if err := exec.Command(path, "--app="+homeURL, "--new-window").Start(); err == nil {
				return nil
			}
		}
	}
	return errors.New("Microsoft Edge was not found")
}

func showError(message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBox := user32.NewProc("MessageBoxW")
	title, _ := syscall.UTF16PtrFromString("OpenWave TV")
	content, _ := syscall.UTF16PtrFromString(message)
	_, _, _ = messageBox.Call(0, uintptr(unsafe.Pointer(content)), uintptr(unsafe.Pointer(title)), 0x10)
}
