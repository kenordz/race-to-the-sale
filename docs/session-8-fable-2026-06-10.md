# Session 8 (Fable) — 2026-06-10 (continuación autónoma)

Cuatro entregas: leaderboard, outcomes (cita/vendido), manager dashboard,
e ingestión ADF/XML. Todas las migraciones aplicadas a Supabase. tsc + eslint
en cero. Ver ROADMAP.md para el estado global.

## 1. 🏆 Leaderboard en vivo (migración `20260610180000`)

- RLS de `xp_events` abierta a nivel dealership (antes: solo tus propios
  eventos — leaderboard imposible).
- `get_leaderboard()`: XP hoy, XP total, citas y ventas por vendedor.
- Panel en el HUD del juego (abajo-izquierda): top 5, tu fila en dorado,
  refresh cada 30s y al instante cuando tu XP cambia.

## 2. 📅🚗 Outcomes: Cita agendada / Vendido

- `mark_lead_outcome(lead_id, outcome)` — SECURITY DEFINER: valida ownership
  y transición de status, escribe status + XP en una transacción, y bloquea
  doble award (no puedes vender el mismo lead dos veces). Guards verificados
  con smoke test en la DB real.
- XP: cita +60, venta +150 (placeholder hasta point_configs).
- **Tecla M** en el juego → panel "My Leads": tu cartera con status chips
  (incluye "⚠️ EN RIESGO" para stealable), botones de Cita y Vendido,
  toasts de celebración.
- Con esto el loop diario completo es jugable:
  claim → email → cita → venta, compitiendo en el leaderboard.

## 3. 📊 Manager dashboard (`/manager`, migración `20260610210000`)

La pantalla que ve quien firma el cheque. Sobria, sin pixel art, role-gated:

- **Leads sin tocar** con minutos esperando — rojo + ⚠️ al pasar 5 min
  (la regla #1 del playbook).
- **Tabla de equipo (hoy)**: actividades/90 con semáforo, leads claimed,
  emails, citas, ventas, robos hechos, leads perdidos por robo, avg response
  time (rojo si >5 min), XP.
- **Funnel actual** por status.
- Refresh automático cada 30s. Links cruzados con /demo y /play.
- /dashboard ahora muestra botones de Manager Dashboard y Demo Director a
  managers.

## 4. 📥 Ingestión ADF/XML (`/api/adf` + `lib/server/adf.ts`)

Leads REALES sin tocar DriveCentric: el dealership agrega un destinatario
extra en su lead routing → servicio de inbound email → POST a este endpoint
→ lead insertado → Realtime lo pone en pantalla de todos con la alarma.

- Parser tolerante (ADF viene sucio en el mundo real): name por partes o
  completo, vehículo año/marca/modelo/trim, provider→source mapping
  (CarGurus/AutoTrader→third_party, etc.), comments y teléfono a metadata,
  raw XML guardado para forensics.
- Probado con formato CarGurus (name parts + phone + comments) y formato
  website (JSON wrapper). Ambos parsean perfecto.
- Auth: secret compartido + dealership UUID en la URL. Usa service-role key
  (los webhooks no tienen sesión).

### Config pendiente (Eugenio, 5 min)

1. `.env.local` → agregar:
   - `SUPABASE_SECRET_KEY=...` (Supabase Dashboard → Settings → API)
   - `ADF_INBOUND_SECRET=...` (genera uno: `openssl rand -hex 32`)
2. Probar local:
   ```bash
   curl -X POST "http://localhost:3000/api/adf?secret=TU_SECRET&dealership=6854a868-980e-4bda-9873-cec0dc90eecf" \
     -H "Content-Type: text/xml" \
     --data '<adf><prospect><vehicle><year>2024</year><make>Toyota</make><model>RAV4</model></vehicle><customer><contact><name part="first">Ana</name><name part="last">Lopez</name><email>ana@test.com</email></contact></customer><provider><name>CarGurus</name></provider></prospect></adf>'
   ```
   → el lead debe aparecer en el juego con la alarma.
3. El servicio de inbound email (CloudMailin/Mailgun) se contrata después
   del deploy a Vercel — necesita URL pública.

## Siguiente

- Deploy a Vercel + dominio (último item técnico de Fase 1).
- Twilio: Eugenio tiene su checklist (cuenta + número 509 + A2P hoy).
- Sergio: 3 preguntas por WhatsApp (mensaje ya redactado).
