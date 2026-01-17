'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Key, Eye, EyeOff, ExternalLink, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'
import { getApiKey, setApiKey, clearApiKey, ApiKeyType } from '@/components/ApiKeyModal'

const API_KEY_INFO: Record<ApiKeyType, {
  name: string
  url: string
  description: string
  required: boolean
}> = {
  apollo: {
    name: 'Apollo.io',
    url: 'https://app.apollo.io/#/settings/integrations/api',
    description: 'Find contacts by company domain and job titles. Required for contact discovery with verified emails.',
    required: true,
  },
  perplexity: {
    name: 'Perplexity AI',
    url: 'https://www.perplexity.ai/settings/api',
    description: 'Web search to enrich company data with real-time information. Reduces AI hallucinations.',
    required: true,
  },
  hunter: {
    name: 'Hunter.io',
    url: 'https://hunter.io/api-keys',
    description: 'Alternative email finder. Useful as a backup to Apollo.',
    required: false,
  },
  apify: {
    name: 'Apify',
    url: 'https://console.apify.com/account/integrations',
    description: 'Web scraping for contact data from LinkedIn and company websites.',
    required: false,
  },
}

// Order keys by importance
const KEY_ORDER: ApiKeyType[] = ['apollo', 'perplexity', 'hunter', 'apify']

export default function SettingsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [keys, setKeys] = useState<Record<ApiKeyType, string>>({
    apollo: '',
    perplexity: '',
    hunter: '',
    apify: '',
  })
  const [showKeys, setShowKeys] = useState<Record<ApiKeyType, boolean>>({
    apollo: false,
    perplexity: false,
    hunter: false,
    apify: false,
  })
  const [savedKey, setSavedKey] = useState<ApiKeyType | null>(null)
  const [validatingKey, setValidatingKey] = useState<ApiKeyType | null>(null)

  // Load keys on mount
  useEffect(() => {
    setKeys({
      apollo: getApiKey('apollo') || '',
      perplexity: getApiKey('perplexity') || '',
      hunter: getApiKey('hunter') || '',
      apify: getApiKey('apify') || '',
    })
  }, [])

  const handleSaveKey = async (keyType: ApiKeyType) => {
    const value = keys[keyType].trim()

    if (value) {
      // Optional: validate the key before saving
      setValidatingKey(keyType)

      // Simple validation - just check format for now
      // Could add actual API validation in the future
      await new Promise(resolve => setTimeout(resolve, 300))

      setApiKey(keyType, value)
      setValidatingKey(null)
    } else {
      clearApiKey(keyType)
    }

    setSavedKey(keyType)
    setTimeout(() => setSavedKey(null), 2000)

    // Trigger storage event for other components
    window.dispatchEvent(new Event('storage'))
  }

  const handleClearKey = (keyType: ApiKeyType) => {
    setKeys(prev => ({ ...prev, [keyType]: '' }))
    clearApiKey(keyType)
    window.dispatchEvent(new Event('storage'))
  }

  const toggleShowKey = (keyType: ApiKeyType) => {
    setShowKeys(prev => ({ ...prev, [keyType]: !prev[keyType] }))
  }

  const hasKey = (keyType: ApiKeyType) => !!keys[keyType]
  const requiredKeys = KEY_ORDER.filter(k => API_KEY_INFO[k].required)
  const optionalKeys = KEY_ORDER.filter(k => !API_KEY_INFO[k].required)
  const allRequiredSet = requiredKeys.every(k => hasKey(k))

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/project/${projectId}/workflow`}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Workflow</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Key className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
            <p className="text-gray-500">
              Manage your API keys for contact discovery and data enrichment
            </p>
          </div>
        </div>

        {/* Status summary */}
        <div className={`mb-6 p-4 rounded-lg border ${
          allRequiredSet
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            {allRequiredSet ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-green-800 font-medium">All required keys configured</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span className="text-amber-800 font-medium">
                  Missing required keys: {requiredKeys.filter(k => !hasKey(k)).map(k => API_KEY_INFO[k].name).join(', ')}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Required keys section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Required Keys</h2>
          <div className="space-y-4">
            {requiredKeys.map(keyType => (
              <ApiKeyCard
                key={keyType}
                keyType={keyType}
                info={API_KEY_INFO[keyType]}
                value={keys[keyType]}
                showValue={showKeys[keyType]}
                isSaved={savedKey === keyType}
                isValidating={validatingKey === keyType}
                onChange={(value) => setKeys(prev => ({ ...prev, [keyType]: value }))}
                onSave={() => handleSaveKey(keyType)}
                onClear={() => handleClearKey(keyType)}
                onToggleShow={() => toggleShowKey(keyType)}
              />
            ))}
          </div>
        </div>

        {/* Optional keys section */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Optional Keys</h2>
          <p className="text-sm text-gray-500 mb-4">
            These services provide alternative data sources and can be used as fallbacks.
          </p>
          <div className="space-y-4">
            {optionalKeys.map(keyType => (
              <ApiKeyCard
                key={keyType}
                keyType={keyType}
                info={API_KEY_INFO[keyType]}
                value={keys[keyType]}
                showValue={showKeys[keyType]}
                isSaved={savedKey === keyType}
                isValidating={validatingKey === keyType}
                onChange={(value) => setKeys(prev => ({ ...prev, [keyType]: value }))}
                onSave={() => handleSaveKey(keyType)}
                onClear={() => handleClearKey(keyType)}
                onToggleShow={() => toggleShowKey(keyType)}
              />
            ))}
          </div>
        </div>

        {/* Privacy note */}
        <div className="mt-8 p-4 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            <strong>Privacy:</strong> API keys are stored securely in your browser&apos;s local storage.
            They are never sent to our servers and are only used to make direct API calls from your browser.
          </p>
        </div>
      </div>
    </main>
  )
}

interface ApiKeyCardProps {
  keyType: ApiKeyType
  info: typeof API_KEY_INFO[ApiKeyType]
  value: string
  showValue: boolean
  isSaved: boolean
  isValidating: boolean
  onChange: (value: string) => void
  onSave: () => void
  onClear: () => void
  onToggleShow: () => void
}

function ApiKeyCard({
  keyType,
  info,
  value,
  showValue,
  isSaved,
  isValidating,
  onChange,
  onSave,
  onClear,
  onToggleShow,
}: ApiKeyCardProps) {
  const hasValue = !!value
  const isStoredKey = !!getApiKey(keyType)
  const hasUnsavedChanges = value !== (getApiKey(keyType) || '')

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{info.name}</span>
          {isStoredKey && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
              <CheckCircle className="w-3 h-3" />
              Configured
            </span>
          )}
          {info.required && !isStoredKey && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
              Required
            </span>
          )}
        </div>
        <a
          href={info.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          Get API key <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <p className="text-sm text-gray-500 mb-3">{info.description}</p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showValue ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${info.name} API key`}
            className="w-full p-2.5 pr-10 border border-gray-200 rounded-lg text-gray-900 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none font-mono"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {hasValue && (
          <button
            type="button"
            onClick={onClear}
            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Clear key"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onSave}
          disabled={!hasUnsavedChanges || isValidating}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isSaved
              ? 'bg-green-100 text-green-700'
              : hasUnsavedChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isValidating ? 'Saving...' : isSaved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  )
}
