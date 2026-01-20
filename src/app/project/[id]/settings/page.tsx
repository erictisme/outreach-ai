'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Key, Eye, EyeOff, ExternalLink, CheckCircle } from 'lucide-react'
import { getSupabase, Project } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import {
  getApiKey,
  setApiKey,
  ApiKeyType,
} from '@/components/ApiKeyModal'

const API_KEY_INFO: Record<ApiKeyType, { name: string; url: string; description: string; required: boolean }> = {
  apollo: {
    name: 'Apollo.io',
    url: 'https://app.apollo.io/#/settings/integrations/api',
    description: 'Find contacts by company domain and job titles',
    required: true,
  },
  hunter: {
    name: 'Hunter.io',
    url: 'https://hunter.io/api-keys',
    description: 'Find email addresses by company domain',
    required: false,
  },
  apify: {
    name: 'Apify',
    url: 'https://console.apify.com/account/integrations',
    description: 'Web scraping for contact data',
    required: false,
  },
  perplexity: {
    name: 'Perplexity AI',
    url: 'https://www.perplexity.ai/settings/api',
    description: 'Web search to enrich company data (reduce hallucinations)',
    required: false,
  },
}

interface ApiKeyState {
  apollo: string
  hunter: string
  apify: string
  perplexity: string
}

export default function SettingsPage() {
  const params = useParams()
  const projectId = params.id as string
  const { addToast } = useToast()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [keys, setKeys] = useState<ApiKeyState>({
    apollo: '',
    hunter: '',
    apify: '',
    perplexity: '',
  })
  const [showKeys, setShowKeys] = useState<Record<ApiKeyType, boolean>>({
    apollo: false,
    hunter: false,
    apify: false,
    perplexity: false,
  })

  // Load project
  useEffect(() => {
    async function loadProject() {
      try {
        const supabase = getSupabase()
        const { data, error: fetchError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            setError('Project not found')
          } else {
            throw fetchError
          }
          return
        }

        setProject(data)
      } catch (err) {
        console.error('Error loading project:', err)
        setError('Failed to load project')
      } finally {
        setLoading(false)
      }
    }

    loadProject()
  }, [projectId])

  // Load API keys from localStorage
  useEffect(() => {
    setKeys({
      apollo: getApiKey('apollo') || '',
      hunter: getApiKey('hunter') || '',
      apify: getApiKey('apify') || '',
      perplexity: getApiKey('perplexity') || '',
    })
  }, [])

  const handleKeyChange = (keyType: ApiKeyType, value: string) => {
    setKeys(prev => ({ ...prev, [keyType]: value }))
  }

  const handleSaveKey = (keyType: ApiKeyType) => {
    setApiKey(keyType, keys[keyType])
    addToast(`${API_KEY_INFO[keyType].name} key saved`, 'success')
  }

  const handleClearKey = (keyType: ApiKeyType) => {
    setKeys(prev => ({ ...prev, [keyType]: '' }))
    setApiKey(keyType, '')
    addToast(`${API_KEY_INFO[keyType].name} key cleared`, 'info')
  }

  const toggleShowKey = (keyType: ApiKeyType) => {
    setShowKeys(prev => ({ ...prev, [keyType]: !prev[keyType] }))
  }

  const isKeySet = (keyType: ApiKeyType): boolean => {
    return !!keys[keyType]?.trim()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" label="Loading settings..." />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-red-600 text-lg">{error || 'Project not found'}</div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Project</span>
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">
            Settings
          </h1>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* API Keys Section */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Key className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">API Keys</h2>
                  <p className="text-sm text-gray-500">
                    Manage your API keys for contact finding and enrichment
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {(Object.keys(API_KEY_INFO) as ApiKeyType[]).map((keyType) => {
                const info = API_KEY_INFO[keyType]
                const hasKey = isKeySet(keyType)

                return (
                  <div key={keyType} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="font-medium text-gray-900">
                          {info.name}
                        </label>
                        {info.required && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                            Required
                          </span>
                        )}
                        {hasKey && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
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
                    <p className="text-xs text-gray-500">{info.description}</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKeys[keyType] ? 'text' : 'password'}
                          value={keys[keyType]}
                          onChange={(e) => handleKeyChange(keyType, e.target.value)}
                          placeholder={`Enter ${info.name} API key`}
                          className="w-full p-2.5 pr-10 border border-gray-200 rounded-lg text-gray-900 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowKey(keyType)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          {showKeys[keyType] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={() => handleSaveKey(keyType)}
                        disabled={!keys[keyType]?.trim()}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      {hasKey && (
                        <button
                          onClick={() => handleClearKey(keyType)}
                          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
              <p className="text-xs text-gray-500">
                Keys are stored in your browser only and never sent to our servers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
