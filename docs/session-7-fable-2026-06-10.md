# Session 7 (Fable) — 2026-06-10

Trabajo autónomo mientras Eugenio estaba en junta. Tres bloques: refactor de
arquitectura, steal mechanic, y panel de demo. Todo aplicado y verificado.

## 1. Refactor: el juego es un skin (aprobado por Eugenio antes de la junta)

- **`lib/game/store.ts`** (nuevo) — store zustand, única fuente de estado del
  cliente: XP, daily, pendingLeads, stealableLeads, toasts, modal. React lo usa
  como hook; Phaser con `getState()`/`subscribe()`.
- **`lib/game/lead-feed.ts`** (nuevo) — la suscripción Realtime salió de
  MainScene; escribe al store. Conserva los comentarios del WS race y el filtro
  UUID.
- **`components/hud/HudOverlay.tsx`** (nuevo) — XP, daily counter y toasts en
  React/Tailwind sobre el canvas. `UIScene.ts` eliminada.
- **MainScene = renderer puro.** Cero Supabase adentro; lee del store.
- **XP no falsificable:** `awardXP` (cliente-dirigido) eliminado. XP solo sale
  de `claim_next_lead` (SQL) y `sendLeadEmail`. Estaciones placeholder
  (Phone/Photo) ya no dan XP ni cuentan actividades — muestran "coming soon".
  El "Today: X/90" ahora solo contiene trabajo verificado.

## 2. Steal mechanic — la regla de los 20 minutos de Sergio ⭐

Migración `20260610120000_steal_mechanic.sql` (aplicada a Supabase
`amdfoibcwqyomqylqumr` ✅):

- Nuevo status `stealable` + evento `lead_stolen` (+40 XP, entre fast y ontime).
- `release_stale_claims(window)` — flip de claims sin comunicación del dueño
  en 20 min → `stealable`. **pg_cron activo, corre cada minuto** (jobname
  `release-stale-claims`). Ventanas < 20 min solo manager/admin (anti-abuso).
- `claim_next_lead` v2 — prioridad: lead `new` más viejo; si no hay, roba el
  `stealable` más viejo de OTRO vendedor. `metadata.stolen_from/stolen_at`
  registra el robo. Mismo patrón atómico FOR UPDATE SKIP LOCKED.
- El dueño SALVA su lead comunicándose: `sendLeadEmail` ahora también flippea
  `stealable → contacted`.
- Cliente: pulso naranja en el Lead Board, sección "😈 STEAL" en el HUD del
  board, alarma sonora distinta (triple pulso grave), toasts para: oportunidad
  de robo, "TU lead está en riesgo", "te robaron el lead 💀", y
  "😈 LEAD STOLEN!" al robar.

**Smoke test en la DB real:** lead claimed hace 30 min sin comunicación →
flipped; lead claimed hace 2 min → intacto. ✅ (Filas de prueba borradas.
Nota: 2 leads viejos tuyos de "Rebecca Cohen" quedaron stealable legítimamente
— el cron los detectó. Comportamiento correcto.)

## 3. Panel de demo — `/demo` 🎬

Para que Sergio dirija el demo desde su teléfono mientras el prospecto ve la
pantalla del juego:

- **Inyectar lead** por source (Website, CarGurus, Phone Up, Walk-in, Text,
  Social) o aleatorio → aparece EN VIVO en el juego vía Realtime.
- **Forzar steal** — todo claim sin comunicación queda robable al instante
  (salta los 20 min para el demo).
- **Reset demo** — borra leads + XP + comunicaciones del dealership (doble
  confirmación; gate manager/admin en UI y en SQL).
- Tu usuario "RTS Dev" fue promovido a `manager` para que puedas entrar. ✅

## Otros arreglos

- `MOCK_LEAD_SOURCES` ahora incluye `third_party` (CarGurus) y `referral`.
- Los 4 errores pre-existentes de eslint en `EmailComposerModal` arreglados
  (entidades sin escapar + setState-en-effect via remount con `key`).
- `tsc --noEmit` y `eslint .` — **cero errores**.

## Cómo probar el flujo completo (2 ventanas)

1. `npm run dev` → login → `/play` en una ventana, `/demo` en el teléfono u
   otra ventana.
2. En /demo: inyecta un lead → en /play suena la alarma, corre al board, SPACE.
3. NO mandes email. En /demo: "Forzar steal" → el board pulsa naranja, el HUD
   muestra "😈 1 para robar", y te llega el toast de "YOUR lead is up for grabs".
4. Con un segundo usuario (otra cuenta del mismo dealership), SPACE en el board
   → "😈 LEAD STOLEN!" +40 XP, y al dueño le llega el toast 💀.
5. Reset demo y repite.

## Pendiente (en orden)

1. Twilio: **iniciar registro A2P 10DLC ya** (tarda días/semanas).
2. SMS station real (Sesión 7 original del roadmap).
3. Manager dashboard read-only (la pantalla que vende).
4. Deploy a Vercel + dominio.
5. Sergio: averiguar acceso API de DriveCentric esta semana (llamada, no código).
