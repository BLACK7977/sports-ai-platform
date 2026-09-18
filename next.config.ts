import type { NextConfig } from "next";

/**
 * Headers de seguridad prácticos para closed beta.
 * CSP "practical": 'unsafe-inline' en scripts es necesario mientras Next 16
 * inyecte scripts de bootstrap en línea (RSC). Endurecer con nonces antes de
 * public launch queda documentado como deuda. Los proveedores AI (Gemini,
 * OpenAI) y Supabase se llaman server-side (fetch de Node), ajenos a connect-src.
 * upgrade-insecure-requests se omite a propósito: rompería desarrollo en http local.
 */
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = `'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;
const connectSrc = `'self' https: wss:${isDev ? " ws:" : ""}`;

const csp = {
  "default-src": "'self'",
  "script-src": scriptSrc,
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob: https:",
  "font-src": "'self' data:",
  "connect-src": connectSrc,
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "frame-ancestors": "'none'",
  "frame-src": "'self'",
  "worker-src": "'self' blob:",
};

const cspValue = Object.entries(csp)
  .map(([directive, value]) => `${directive} ${value}`)
  .join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspValue },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
          },
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;