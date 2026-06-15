# Race to the Sale — Roadmap maestro

> Actualizado: 2026-06-10 (Sesión 7-8, Fable)
> Regla: nada se borra de aquí — se marca `[x]` y se le pone fecha.
> Dueños: **K** = Keno (Eugenio/Fable, código) · **S** = Sergio (negocio/dealership)

## ✅ Fase 0 — Base (hecho)

- [x] Refactor: store zustand, HUD React, Phaser como renderer puro (2026-06-10)
- [x] XP no falsificable: solo acciones verificadas server-side (2026-06-10)
- [x] Steal mechanic 20-min con pg_cron + Realtime (2026-06-10)
- [x] Panel Demo Director en `/demo` (2026-06-10)

## 🔨 Fase 1 — Loop diario completo (en curso)

El día completo de un vendedor jugable: claim → llamar → textear → email → cita → venta.

- [x] **K — Leaderboard en vivo** dentro del juego (RLS dealership-wide en xp_events) (2026-06-10)
- [x] **K — Acciones "Cita agendada" y "Vendido"** — panel My Leads con tecla M, transiciones validadas y XP server-side (2026-06-10)
- [x] **K — Ingestión ADF/XML: endpoint + parser** — `/api/adf` provider-agnostic, probado con formatos CarGurus y website (2026-06-10)
  - [ ] **E — Config pendiente**: agregar a `.env.local` → `SUPABASE_SECRET_KEY` (Dashboard → Settings → API → secret key) y `ADF_INBOUND_SECRET` (string random largo)
  - [ ] **K/E — Contratar inbound email** (CloudMailin gratis hasta 200/mes, o Mailgun Routes) y apuntarlo a `/api/adf?secret=...&dealership=<uuid>` — después del deploy
- [x] **K — Manager dashboard read-only** en `/manager` — leads sin tocar con alerta >5min, tabla de equipo (actividades/90, citas, ventas, robos, perdidos, avg response), funnel; refresh cada 30s (2026-06-10)
- [ ] **E — Deploy a Vercel + dominio** + cuentas de reps — guía paso-a-paso lista en `DEPLOY.md` (30 min, requiere cuentas de Eugenio)
- [x] **K — Seed de demo data realista** — botón "🌱 Sembrar día de demo" en /demo: 11 leads (nuevos, urgentes, claims, citas, venta), idempotente (2026-06-10)

## 📞 Fase 2 — Comunicaciones reales

- [ ] **S — Crear cuenta Twilio + iniciar registro A2P 10DLC HOY** (tarda semanas; bloquea SMS)
- [ ] **K — SMS station con Twilio** (templates, send real, log en lead_communications)
- [ ] **K — Dialer outbound WebRTC** (Twilio Voice JS SDK): click-to-call desde Phone Booth, XP por status callback verificado (>30s), modal de disposición post-llamada
- [ ] **K — Email producción**: verificar `priceyv.com` en Resend (DNS en GoDaddy) + **BCC a la dirección de ingestión de DriveCentric** (logging al CRM sin API)
- [ ] **S/K — Grabación de llamadas**: WA es two-party consent — definir anuncio o no grabar (preguntar cómo lo hace el conmutador actual)

## 🧪 Fase 3 — Piloto en Price Yakima Valley

- [ ] **S — Confirmar dirección de ingestión email de DriveCentric por usuario** (habilita el BCC)
- [ ] **S — Confirmar que puede agregar destinatario ADF extra en el lead routing** (habilita leads reales)
- [ ] **S — ¿Internet leads open-floor o asignados round-robin?** (define si necesitamos modo "asignado con ventana de 20 min")
- [ ] **S — Elegir 2-3 vendedores para el piloto** + horario/turno
- [x] **K — Tutorial/onboarding dentro del juego** — overlay de primera visita con controles y la regla del robo (2026-06-10)
- [ ] **E — Grabar video demo de 3 min** — guion shot-by-shot listo en `docs/guion-video-demo.md`
- [ ] **K/S — Definir métricas del piloto**: response time promedio, % leads tocados <5 min, actividades/día, citas/semana — ANTES vs DESPUÉS
- [ ] **S — Demos con 3-5 contactos** una vez que el piloto tenga 2 semanas de datos

## 🎮 Fase 4 — V2 (post-piloto, no construir antes)

- [ ] **Phone-up race inbound** (visión VICIdial de Keno): llamada entrante suena para todo el floor, primero que contesta se la queda — bucket #13 como gameplay ⭐
- [ ] Presencia multiplayer visible (avatares de compañeros en el mapa)
- [ ] Juice: combos de Lightning claims, rangos (Rookie→Closer→Shark), streaks diarios, recap de fin de día
- [ ] XP atado a spiffs/bonos reales del dealership (retención estructural)
- [ ] `point_configs` resucitada: economía de XP configurable por dealership
- [ ] Aging buckets automation (los 13 buckets moviéndose solos)
- [ ] Integración DriveCentric API (si S consigue acceso) o CRM-agnostic vía ADF
- [ ] Customización de avatar comprable con XP

## 📌 Decisiones tomadas (para no re-discutir)

- El juego es un **skin sobre el motor de actividad** — toda lógica vive en Postgres/server actions, Phaser solo pinta.
- **XP solo por trabajo verificado** server-side. Nunca XP por presionar SPACE.
- Twilio sobre LiveKit para voz/SMS (un vendor, status callbacks = XP verificado). LiveKit queda como opción de escala.
- Outbound primero, inbound race en V2.
- Sin signup wizard self-serve hasta tener clientes — onboarding concierge.
- Email real pospuesto hasta dominio verificado + BCC-to-CRM confirmado.
