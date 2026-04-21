import { NextResponse } from 'next/server'

const AUTH_COOKIE = 'ipmp_auth'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(AUTH_COOKIE)
  return response
}
