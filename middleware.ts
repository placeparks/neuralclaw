import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (
    !request.nextUrl.pathname.startsWith("/onboard")
    && !request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("neuralclub_session")?.value;
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/onboard/:path*", "/dashboard/:path*"],
};
