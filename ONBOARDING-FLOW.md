# Flujo BarberCloud (referencia QA)

Marca: **BarberCloud** · Precios en **COP** · Usuario nuevo = **campos vacíos** (sin calendarios precargados).

Inspirado en Confirmafy: registro → prueba o pago → panel → configuración en Autoagenda.

---

## Rutas principales

### A) «Empieza gratis» (trial 7 días, sin tarjeta)

1. `landing.html` — CTA **Empieza gratis** / **Empieza ahora**
2. `login.html` — registro (Gmail o email)
3. Backend `POST /api/trial/start` — crea negocio + trial 7 días
4. `index.html` — panel con calendarios vacíos
5. `js/welcome.js` — wizard: intro → volumen → agenda → WhatsApp → cita prueba
6. `calendario.html` — 6 coachmarks (amarillo / verde / rojo / prueba)
7. Outro → **Ir al panel**
8. `autoagenda.html?setup=1` — personalizar enlace público, servicios y horarios

### B) «Elegir plan» (pago directo con Wompi)

1. `landing.html` — tarjeta de plan → `login.html?next=suscripcion&plan=…`
2. `login.html` — registro o entrada
3. `suscripcion.html?need=1&plan=…` — checkout Wompi (COP)
4. Retorno `?ref=…` → webhook confirma → redirect a `index.html`
5. Pasos 5–8 iguales a la ruta A (welcome tour + autoagenda)

### C) Usuario que ya tiene cuenta

| Estado | Destino |
|--------|---------|
| Sin sesión en panel | `login.html` |
| Trial/suscripción activa, welcome pendiente | `index.html` + wizard |
| Trial/suscripción activa, welcome hecho | `index.html` |
| Trial vencido o sin pagar nunca | `suscripcion.html?need=1` |
| Pagó antes y venció | `index.html` modo solo lectura + banner renovar |

---

## Redirecciones clave

| Archivo | Comportamiento |
|---------|----------------|
| `js/login.js` → `afterAuth()` | `next=suscripcion` → suscripción; cuenta nueva → trial + panel; activo → panel; vencido → panel lectura; else → suscripción |
| `js/app.js` → `initTenantGate()` | Panel exige login; suscripción exige login; ya no manda a `onboarding.html` |
| `js/suscripcion.js` | Post-Wompi aprobado + welcome pendiente → `index.html` |
| `js/welcome.js` | Escucha `barbercloud:panel-ready` y abre wizard |

---

## Qué personaliza el usuario (post-trial/pago)

- **Autoagenda**: slug, nombre, servicios, horarios, avatar
- **Calendarios** (`index.html`): solo aparecen si el usuario los configura o conecta Google
- **WhatsApp**: en welcome tour y luego en Configuración
- **Suscripción**: upgrade desde banner trial, sidebar o `suscripcion.html`

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `api/trial/start.js` | Trial 7 días (service role) |
| `api/wompi/checkout.js` | Pago; crea negocio si falta |
| `js/welcome.js` | Wizard + coachmarks + outro |
| `js/billing.js` | `startTrial()`, caché, checkout |
| `js/suscripcion.js` | UI planes COP, retorno Wompi |
| `js/calendarios.js` | Oculta filas hasta que el usuario configure |
| `js/autoagenda.js` | Formularios vacíos si `shouldUseEmptyForms()` |

---

## Cómo probar end-to-end

1. **Trial**: ventana incógnito → `landing.html` → Empieza gratis → crear cuenta → verificar panel vacío + wizard + coachmarks → Autoagenda vacío.
2. **Pago**: incógnito → landing → Elegir plan → login → suscripción → Wompi sandbox → panel + wizard.
3. **Re-login**: cerrar sesión → entrar → ir directo al panel (sin repetir wizard si `barbercloud.welcome.seen`).
4. **Sin plan**: usuario con trial vencido → banner + redirect a suscripción al intentar editar.

`onboarding.html` queda solo para pruebas locales sin Supabase (`?force=1`).
