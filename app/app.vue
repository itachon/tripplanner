<template>
  <!-- Un aviso a la vez: en celular varios apilados tapan el contenido -->
  <UApp :toaster="{ max: 1 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
