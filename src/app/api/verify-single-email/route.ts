import { NextRequest, NextResponse } from 'next/server'

interface HunterVerifyResponse {
  data: {
    status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown'
    score: number
    email: string
    regexp: boolean
    gibberish: boolean
    disposable: boolean
    webmail: boolean
    mx_records: boolean
    smtp_server: boolean
    smtp_check: boolean
    accept_all: boolean
    block: boolean
  }
  meta: {
    params: {
      email: string
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json() as {
      email: string
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const hunterApiKey = process.env.HUNTER_API_KEY
    if (!hunterApiKey) {
      return NextResponse.json({ error: 'Hunter API not configured' }, { status: 500 })
    }

    // Call Hunter.io Email Verifier API
    const response = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${hunterApiKey}`
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Hunter API error:', response.status, errorText)

      if (response.status === 401) {
        return NextResponse.json({ error: 'Invalid Hunter API key' }, { status: 401 })
      }
      if (response.status === 429) {
        return NextResponse.json({ error: 'Rate limited - try again later' }, { status: 429 })
      }

      return NextResponse.json({ error: 'Hunter API error' }, { status: 500 })
    }

    const data: HunterVerifyResponse = await response.json()

    // Map Hunter status to our verification result
    const statusMap: Record<string, { verified: boolean; certainty: number; message: string }> = {
      valid: { verified: true, certainty: 100, message: 'Valid email (Hunter verified)' },
      invalid: { verified: false, certainty: 0, message: 'Invalid email (Hunter)' },
      accept_all: { verified: true, certainty: 80, message: 'Accept-all domain (Hunter)' },
      webmail: { verified: true, certainty: 90, message: 'Webmail address (Hunter)' },
      disposable: { verified: false, certainty: 10, message: 'Disposable email (Hunter)' },
      unknown: { verified: false, certainty: 50, message: 'Unknown status (Hunter)' },
    }

    const result = statusMap[data.data.status] || { verified: false, certainty: 50, message: 'Unknown' }

    return NextResponse.json({
      email,
      status: data.data.status,
      verified: result.verified,
      certainty: result.certainty,
      message: result.message,
      score: data.data.score,
      details: {
        mxRecords: data.data.mx_records,
        smtpServer: data.data.smtp_server,
        smtpCheck: data.data.smtp_check,
        acceptAll: data.data.accept_all,
        disposable: data.data.disposable,
        webmail: data.data.webmail,
      },
    })
  } catch (error) {
    console.error('Verify single email error:', error)
    return NextResponse.json(
      { error: 'Failed to verify email' },
      { status: 500 }
    )
  }
}
