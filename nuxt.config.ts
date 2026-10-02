// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/supabase'],

  css: ['~/assets/css/main.css', 'mapbox-gl/dist/mapbox-gl.css'],

  // Los componentes se usan por su nombre de archivo, sin prefijo de carpeta
  components: [{ path: '~/components', pathPrefix: false }],

  supabase: {
    types: '~~/shared/types/database.types.ts',
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      // Solo el portal de administración exige sesión.
      // El viajero entra por /v/:token sin cuenta.
      include: ['/admin(/*)?'],
      exclude: ['/registro'],
      saveRedirectToCookie: true,
    },
  },

  runtimeConfig: {
    // Solo servidor: nunca llega al navegador
    pexelsApiKey: '',                   // NUXT_PEXELS_API_KEY (opcional, respaldo de fotos)
    public: {
      // URL pública del sitio, para armar los links y QR de los viajeros.
      // Vacío = usa el dominio desde donde se abrió el panel.
      siteUrl: '',
      // Token público de Mapbox (pk.…). Restríngelo a tu dominio en Mapbox.
      mapboxToken: '',
    },
  },

  vite: {
    optimizeDeps: { include: ['mapbox-gl', 'qrcode'] },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      title: 'Viajes',
    },
  },
})
