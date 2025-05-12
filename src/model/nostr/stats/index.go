package main

import (
	"encoding/json"
	"runtime"
	"strings"
	"syscall/js"
	"time"
)

type GoroutineStats struct {
    Count       int                `json:"count"`
    Timestamp   int64              `json:"timestamp"`
    MemoryKB    uint64             `json:"memoryKB"`
    TopRoutines []GoroutineDetails `json:"topRoutines"`
}

type GoroutineDetails struct {
    ID       int      `json:"id"`
    State    string   `json:"state"`
    Function string   `json:"function"`
    Stack    []string `json:"stack"`
}

var goroutineHistory = make([]GoroutineStats, 0, 100)

// Collects detailed goroutine information
func collectGoroutineDetails() []GoroutineDetails {
    // Get stack traces of all goroutines
    buf := make([]byte, 1<<20)
    length := runtime.Stack(buf, true)

    stacks := strings.Split(string(buf[:length]), "\n\n")
    details := make([]GoroutineDetails, 0, len(stacks))

    for i, stack := range stacks {
        if i >= 20 { // Limit to top 20 for performance
            break
        }

        lines := strings.Split(stack, "\n")
        if len(lines) < 2 {
            continue
        }

        // Parse the goroutine header line
        header := lines[0]

        // Extract state from header (e.g., "running", "sleep")
        state := "unknown"
        if strings.Contains(header, "running") {
            state = "running"
        } else if strings.Contains(header, "sleep") {
            state = "sleeping"
        } else if strings.Contains(header, "wait") {
            state = "waiting"
        }

        // Get the function name from the first call in the stack
        function := "unknown"
        if len(lines) > 1 {
            parts := strings.Split(strings.TrimSpace(lines[1]), " ")
            if len(parts) > 0 {
                function = parts[0]
            }
        }

        // Simplify stack for display (take just function names)
        stackTrace := make([]string, 0)
        for j := 1; j < len(lines); j += 2 {
            if j < len(lines) && strings.TrimSpace(lines[j]) != "" {
                stackTrace = append(stackTrace, strings.TrimSpace(lines[j]))
            }
        }

        details = append(details, GoroutineDetails{
            ID:       i + 1,
            State:    state,
            Function: function,
            Stack:    stackTrace,
        })
    }

    return details
}

// Periodically collect goroutine stats and expose to JS
func startGoroutineMonitor() {
    // Create a JS function to update the UI
    js.Global().Set("getGoroutineStats", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
        // Return the current stats array as JSON
        jsonBytes, _ := json.Marshal(goroutineHistory)
        return string(jsonBytes)
    }))

    // Create a JS function to get current detailed info
    js.Global().Set("getCurrentGoroutineDetails", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
        details := collectGoroutineDetails()
        jsonBytes, _ := json.Marshal(details)
        return string(jsonBytes)
    }))

    // Start the monitoring goroutine
    go func() {
        for {
            var m runtime.MemStats
            runtime.ReadMemStats(&m)

            stats := GoroutineStats{
                Count:       runtime.NumGoroutine(),
                Timestamp:   time.Now().Unix(),
                MemoryKB:    m.Alloc / 1024,
                TopRoutines: collectGoroutineDetails(),
            }

            // Add to history, keeping most recent 100
            goroutineHistory = append(goroutineHistory, stats)
            if len(goroutineHistory) > 100 {
                goroutineHistory = goroutineHistory[1:]
            }

            // Notify JS that data has been updated
            js.Global().Call("goroutineDataUpdated")

            time.Sleep(2 * time.Second)
        }
    }()
}
