import { NextResponse } from 'next/server'

const AUTH_COOKIE = 'ipmp_auth'
const SESSION_DAYS = 30

export async function POST(request: Request) {
  try {
    const { password } = await request.json()

    if (!password || password !== process.env.ACCESS_SECRET) {
      await new Promise(r => setTimeout(r, 1000)) // delay contra brute force
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(AUTH_COOKIE, password, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * SESSION_DAYS,
    })
    return response
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
