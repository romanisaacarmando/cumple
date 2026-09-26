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

La web se publica en **Vercel** y guarda los datos en **Upstash Redis**. Los dos tienen plan gratuito y todo se hace desde el navegador.

1. Entrá a [vercel.com](https://vercel.com) y registrate con **Continue with GitHub**.
2. Tocá **Add New… → Project**, buscá el repositorio `cumple` y tocá **Import**.
3. Dejá todo como está (Framework Preset: *Other*) y tocá **Deploy**.
4. Cuando termine, entrá al proyecto → pestaña **Storage** → **Create Database** → elegí **Upstash** (Redis) → plan **Free** → conectala al proyecto (dejá marcados todos los entornos).
5. Andá a la pestaña **Deployments**, abrí el menú **⋯** del último deploy y tocá **Redeploy**, para que la web tome la base de datos.
6. Listo: abrí la dirección que te da Vercel (algo como `cumple-xxxx.vercel.app`) y creá tu lista.

Si te olvidás del paso 4, la web muestra el aviso *"La base de datos no está configurada"*.

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
lib/store.js   guardado de datos (Upstash Redis, o memoria en desarrollo)
dev-server.js  servidor local que imita a Vercel
```

Links:

- `/l/{id}`: la lista que ven los amigos.
- `/a/{id}#k={clave}`: el panel del cumpleañero. La clave va después del `#`, así nunca llega a los registros del servidor.
