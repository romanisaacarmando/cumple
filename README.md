# 🎁 Lista de regalos de cumple

Una web para que no te regalen dos veces lo mismo.

1. **El cumpleañero** arma su lista de regalos (con precio, link y detalles).
2. La **comparte por WhatsApp** con un solo link.
3. Cada **amigo** elige un regalo y lo reserva: queda bloqueado para los demás.

Funciona así:

- **Modo sorpresa:** el cumpleañero ve qué regalos están reservados, pero nunca quién los eligió.
- **Regalos entre dos:** algunos regalos se pueden marcar como compartidos, y entonces hasta dos amigos pueden juntarse para regalarlo. Cada uno ve el nombre del otro para coordinar.
- Los amigos **no necesitan registrarse**, y pueden liberar su reserva si cambian de idea.
- Si dos personas tocan "Lo regalo yo" al mismo tiempo, solo una se queda con el regalo.
- No hay cuentas ni contraseñas: el cumpleañero administra su lista con un **link secreto** que recibe al crearla.

## Publicarla en internet (gratis)

La web se publica en **Vercel** y guarda los datos en **Supabase**. Los dos tienen plan gratuito.

**En Supabase:**

1. Creá un proyecto nuevo (o usá uno que ya tengas).
2. Andá a **SQL Editor → New query**, pegá el contenido de [`supabase.sql`](supabase.sql) y tocá **Run**.
3. Andá a **Project Settings → Data API** y copiá la **Project URL**.
4. Andá a **Project Settings → API Keys** y copiá una **secret key** (`sb_secret_…`). Si tu proyecto usa las claves viejas, sirve la **service_role**. No uses la clave *anon* ni la *publishable*.

**En Vercel:**

1. Entrá a [vercel.com](https://vercel.com) con **Continue with GitHub**, tocá **Add New… → Project** e importá el repositorio `cumple` (Framework Preset: *Other*).
2. En el proyecto, andá a **Settings → Environment Variables** y agregá:
   - `SUPABASE_URL` = la Project URL
   - `SUPABASE_SECRET_KEY` = la secret key
3. Andá a **Deployments → ⋯ → Redeploy**, porque las variables solo se cargan en un deploy nuevo.
4. Abrí la dirección de producción (**Overview → Domains**) y creá tu lista.

La secret key da acceso total a la base: cargala solo en Vercel y no la compartas.

Si aparece el aviso *"La base de datos no está configurada"*, faltan las variables o falta el Redeploy. El aviso muestra qué variables encontró.

Cada vez que se suba un cambio a la rama principal de GitHub, Vercel actualiza la web solo.

## Probarla en tu computadora

Necesitás [Node.js](https://nodejs.org) 20 o superior. No hay dependencias que instalar.

```bash
npm run dev    # abre la web en http://localhost:3000 (los datos se guardan en memoria)
npm test       # corre los tests
```

## Cómo está hecha

```
public/        páginas: inicio (index), panel del cumpleañero (admin) y lista para amigos (lista)
api/           funciones del servidor (Vercel las ejecuta automáticamente)
lib/core.js    reglas de la lista: crear, reservar, liberar, editar
lib/store.js   guardado de datos (Supabase, o memoria en desarrollo)
supabase.sql   crea la tabla en Supabase
dev-server.js  servidor local que imita a Vercel
```

Links:

- `/l/{id}`: la lista que ven los amigos.
- `/a/{id}#k={clave}`: el panel del cumpleañero. La clave va después del `#`, así nunca llega a los registros del servidor.
