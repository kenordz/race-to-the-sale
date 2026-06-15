# Deploy a producción — guía de 30 minutos

Lo único que Fable no puede hacer por ti (necesita TUS cuentas). Sigue en orden.

## 1. Variables de entorno (5 min)

Completa tu `.env.local` ANTES del deploy (las mismas van a Vercel después):

```bash
# Ya las tienes:
NEXT_PUBLIC_SUPABASE_URL=https://amdfoibcwqyomqylqumr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(la actual)
RESEND_API_KEY=(la actual)
RESEND_FROM_EMAIL=onboarding@resend.dev
EMAIL_TEST_RECIPIENT=eugenio.rdzdlg05@gmail.com

# NUEVAS — agrégalas:
SUPABASE_SECRET_KEY=        # Supabase Dashboard → Settings → API keys → secret
ADF_INBOUND_SECRET=         # genera: openssl rand -hex 32
```

Prueba local que el webhook ADF funciona (con `npm run dev` corriendo):

```bash
curl -X POST "http://localhost:3000/api/adf?secret=TU_ADF_SECRET&dealership=6854a868-980e-4bda-9873-cec0dc90eecf" \
  -H "Content-Type: text/xml" \
  --data '<adf><prospect><vehicle><year>2024</year><make>Toyota</make><model>RAV4</model></vehicle><customer><contact><name part="first">Ana</name><name part="last">Lopez</name><email>ana@test.com</email></contact></customer><provider><name>CarGurus</name></provider></prospect></adf>'
```

→ Respuesta `{"ok":true,...}` y el lead aparece en /play con alarma.

## 2. Vercel (15 min)

1. `npm i -g vercel` (o usa vercel.com → Import desde GitHub, más fácil).
2. Importa el repo `kenordz/race-to-the-sale`. Framework: Next.js (auto).
3. En Project → Settings → Environment Variables: pega TODAS las variables
   del paso 1 (incluidas las `NEXT_PUBLIC_*`).
4. Deploy. Verifica: login → /play → juego corre → /demo → seed → /manager.
5. Dominio (~$12/año): Settings → Domains. Sugerencias:
   `racetothesale.app`, `racetothesale.io`, `rtts.gg`.

## 3. Supabase para producción (5 min)

1. Authentication → URL Configuration → agrega tu dominio de Vercel a
   "Site URL" y "Redirect URLs".
2. (Opcional, recomendado) Authentication → desactivar signups públicos —
   el onboarding del piloto es manual.

## 4. Cuentas de los reps del piloto (5 min)

Por cada vendedor: Authentication → Users → Add user (email + password
temporal). Luego en SQL Editor:

```sql
update public.profiles
set full_name = 'Nombre Apellido',
    dealership_id = '6854a868-980e-4bda-9873-cec0dc90eecf'
where id = '<uuid del user recién creado>';
```

(El trigger crea el profile automáticamente; solo asignas nombre + dealership.
Crea también un dealership real para Yakima cuando arranque el piloto:
`insert into dealerships (name) values ('Price Ford Yakima Valley');`)

## 5. Inbound email para ADF (después del deploy)

1. Cuenta en CloudMailin (gratis hasta 200 emails/mes — sobra para empezar).
2. Target URL: `https://TU-DOMINIO/api/adf?secret=TU_ADF_SECRET&dealership=<uuid>`
   - Formato: "JSON - Normalized" o "Raw"; ambos funcionan.
3. CloudMailin te da una dirección tipo `xyz@cloudmailin.net` → esa es la que
   Sergio agrega como destinatario extra en el lead routing de la tienda.

## 6. Twilio (en paralelo — ver checklist en WhatsApp/ROADMAP)

Cuenta + número 509 + registro A2P 10DLC hoy. El código de SMS se construye
cuando el A2P esté aprobado.
