'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Key, Eye, EyeOff, ExternalLink } from 'lucide-react'

// localStorage keys for API keys (client-side only)
const API_KEY_STORAGE = {
  apollo: 'outreach-ai-apollo-key',
  hunter: 'outreach-ai-hunter-key',
  apify: 'outreach-ai-apify-key',
} as const

export type ApiKeyType = keyof typeof API_KEY_STORAGE

interface ApiKeyModalProps {
  isOpen: boolean
  requiredKey?: ApiKeyType  // If set, highlights which key is needed
  onClose: () => void
  onSave?: () => void
}

interface ApiKeyState {
  apollo: string
  hunter: string
  apify: string
}

// Utility functions for API key management
export function getApiKey(keyType: ApiKeyType): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(API_KEY_STORAGE[keyType])
}

export function setApiKey(keyType: ApiKeyType, value: string): void {
  if (typeof window === 'undefined') return
  if (value.trim()) {
    localStorage.setItem(API_KEY_STORAGE[keyType], value.trim())
  } else {
    localStorage.removeItem(API_KEY_STORAGE[keyType])
  }
}

export function clearApiKey(keyType: ApiKeyType): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(API_KEY_STORAGE[keyType])
}

export function getAllApiKeys(): ApiKeyState {
  return {
    apollo: getApiKey('apollo') || '',
    hunter: getApiKey('hunter') || '',
    apify: getApiKey('apify') || '',
  }
}

export function hasAnyContactProvider(): boolean {
  return !!(getApiKey('apollo') || getApiKey('hunter') || getApiKey('apify'))
}

const API_KEY_INFO: Record<ApiKeyType, { name: string; url: string; description: string }> = {
  apollo: {
    name: 'Apollo.io',
    url: 'https://app.apollo.io/#/settings/integrations/api',
    description: 'Find contacts by company domain and job titles',
  },
  hunter: {
    name: 'Hunter.io',
    url: 'https://hunter.io/api-keys',
    description: 'Find email addresses by company domain',
  },
  apify: {
    name: 'Apify',
    url: 'https://console.apify.com/account/integrations',
    description: 'Web scraping for contact data',
  },
}

export function ApiKeyModal({ isOpen, requiredKey, onClose, onSave }: ApiKeyModalProps) {
  const [keys, setKeys] = useState<ApiKeyState>({ apollo: '', hunter: '', apify: '' })
  const [showKeys, setShowKeys] = useState<Record<ApiKeyType, boolean>>({
    apollo: false,
    hunter: false,
    apify: false,
  })
  const [savedMessage, setSavedMessage] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load keys from localStorage on open
  useEffect(() => {
    if (isOpen) {
      setKeys(getAllApiKeys())
      setSavedMessage(false)
      // Focus the required key input or first input
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleSave = () => {
    // Save all keys to localStorage
    setApiKey('apollo', keys.apollo)
    setApiKey('hunter', keys.hunter)
    setApiKey('apify', keys.apify)

    setSavedMessage(true)
    setTimeout(() => {
      setSavedMessage(false)
      onSave?.()
      onClose()
    }, 1000)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const toggleShowKey = (keyType: ApiKeyType) => {
    setShowKeys(prev => ({ ...prev, [keyType]: !prev[keyType] }))
  }

  const clearKey = (keyType: ApiKeyType) => {
    setKeys(prev => ({ ...prev, [keyType]: '' }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Key className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">API Keys</h2>
            <p className="text-sm text-gray-500">
              Enter your API keys to enable contact finding
            </p>
          </div>
        </div>

        {requiredKey && !keys[requiredKey] && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>{API_KEY_INFO[requiredKey].name}</strong> API key is required to search for contacts.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {(Object.keys(API_KEY_INFO) as ApiKeyType[]).map((keyType) => {
            const info = API_KEY_INFO[keyType]
            const isRequired = keyType === requiredKey

            return (
              <div
                key={keyType}
                className={`p-4 rounded-lg border ${isRequired ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <label className="font-medium text-gray-900">
                    {info.name}
                    {isRequired && <span className="text-amber-600 ml-1">*</span>}
                  </label>
                  <a
                    href={info.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    Get API key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-gray-500 mb-2">{info.description}</p>
                <div className="relative">
                  <input
                    ref={isRequired ? inputRef : undefined}
                    type={showKeys[keyType] ? 'text' : 'password'}
                    value={keys[keyType]}
                    onChange={(e) => setKeys(prev => ({ ...prev, [keyType]: e.target.value }))}
                    placeholder={`Enter ${info.name} API key`}
                    className="w-full p-2.5 pr-20 border border-gray-200 rounded-lg text-gray-900 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none font-mono"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {keys[keyType] && (
                      <button
                        type="button"
                        onClick={() => clearKey(keyType)}
                        className="p-1 text-gray-400 hover:text-gray-600 text-xs"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleShowKey(keyType)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      {showKeys[keyType] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Keys are stored in your browser only and never sent to our servers.
        </p>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            {savedMessage ? (
              <>
                <span className="text-green-200">✓</span> Saved!
              </>
            ) : (
              'Save Keys'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
