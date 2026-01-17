// Prompt logging utility for debugging LLM API calls

export interface PromptLogEntry {
  id: string
  timestamp: Date
  endpoint: string
  request: unknown
  response: unknown | null
  error: string | null
  duration: number | null
  status: 'pending' | 'success' | 'error'
}

const STORAGE_KEY = 'prompt-inspector-log'
const MAX_ENTRIES = 100

// In-memory log for current session
let logEntries: PromptLogEntry[] = []

// Listeners for real-time updates
type LogListener = (entries: PromptLogEntry[]) => void
const listeners: Set<LogListener> = new Set()

// Load from sessionStorage on init
function loadFromStorage(): void {
  if (typeof window === 'undefined') return

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      logEntries = parsed.map((entry: PromptLogEntry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      }))
    }
  } catch (e) {
    console.warn('Failed to load prompt log from storage:', e)
  }
}

// Save to sessionStorage
function saveToStorage(): void {
  if (typeof window === 'undefined') return

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logEntries))
  } catch (e) {
    console.warn('Failed to save prompt log to storage:', e)
  }
}

// Notify all listeners of changes
function notifyListeners(): void {
  listeners.forEach(listener => listener([...logEntries]))
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Start logging an API call (returns entry ID)
export function logPromptStart(endpoint: string, request: unknown): string {
  loadFromStorage() // Ensure we have latest

  const entry: PromptLogEntry = {
    id: generateId(),
    timestamp: new Date(),
    endpoint,
    request,
    response: null,
    error: null,
    duration: null,
    status: 'pending',
  }

  logEntries.unshift(entry)

  // Trim to max entries
  if (logEntries.length > MAX_ENTRIES) {
    logEntries = logEntries.slice(0, MAX_ENTRIES)
  }

  saveToStorage()
  notifyListeners()

  return entry.id
}

// Complete logging an API call with success
export function logPromptSuccess(id: string, response: unknown): void {
  const entry = logEntries.find(e => e.id === id)
  if (entry) {
    entry.response = response
    entry.status = 'success'
    entry.duration = Date.now() - entry.timestamp.getTime()
    saveToStorage()
    notifyListeners()
  }
}

// Complete logging an API call with error
export function logPromptError(id: string, error: string): void {
  const entry = logEntries.find(e => e.id === id)
  if (entry) {
    entry.error = error
    entry.status = 'error'
    entry.duration = Date.now() - entry.timestamp.getTime()
    saveToStorage()
    notifyListeners()
  }
}

// Get all log entries
export function getPromptLog(): PromptLogEntry[] {
  loadFromStorage()
  return [...logEntries]
}

// Clear all log entries
export function clearPromptLog(): void {
  logEntries = []
  saveToStorage()
  notifyListeners()
}

// Subscribe to log updates
export function subscribeToPromptLog(listener: LogListener): () => void {
  listeners.add(listener)
  // Immediately call with current entries
  listener([...logEntries])

  // Return unsubscribe function
  return () => {
    listeners.delete(listener)
  }
}

// Wrapper for fetch that auto-logs prompts
export async function loggedFetch(
  endpoint: string,
  options: RequestInit
): Promise<Response> {
  let requestBody: unknown = null

  try {
    if (options.body && typeof options.body === 'string') {
      requestBody = JSON.parse(options.body)
    }
  } catch {
    requestBody = options.body
  }

  const logId = logPromptStart(endpoint, requestBody)

  try {
    const response = await fetch(endpoint, options)

    // Clone response to read body without consuming it
    const clonedResponse = response.clone()

    try {
      const responseData = await clonedResponse.json()
      if (response.ok) {
        logPromptSuccess(logId, responseData)
      } else {
        logPromptError(logId, responseData.error || `HTTP ${response.status}`)
      }
    } catch {
      // Response wasn't JSON
      if (response.ok) {
        logPromptSuccess(logId, { _note: 'Non-JSON response' })
      } else {
        logPromptError(logId, `HTTP ${response.status}`)
      }
    }

    return response
  } catch (error) {
    logPromptError(logId, error instanceof Error ? error.message : 'Network error')
    throw error
  }
}
