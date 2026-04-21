import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_COOKIE = 'ipmp_auth'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Rutas publicas permitidas sin login
  const publicPaths = ['/login', '/api/auth/login', '/api/auth/logout', '/robots.txt', '/logos', '/_next', '/favicon.ico']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  if (isPublic) return NextResponse.next()

  // Verificar cookie de sesion
  const authCookie = request.cookies.get(AUTH_COOKIE)
  if (authCookie?.value === process.env.ACCESS_SECRET) {
    return NextResponse.next()
  }

  // Redirigir a login
  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
