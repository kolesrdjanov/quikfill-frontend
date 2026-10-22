<script setup lang="ts">
import { reactive, ref } from 'vue'
const values = reactive({ email: '', firstName: '', checked: false })
const tick = ref(0)
</script>
<template>
  <form
    :data-email="values.email"
    :data-name="values.firstName"
    :data-checked="values.checked"
    :data-tick="tick"
    @submit.prevent
  >
    <input v-model="values.email" name="email" type="email" />
    <input v-model="values.firstName" name="first_name" />
    <input v-model="values.checked" name="enabled" type="checkbox" required />
    <button type="button" @click="tick++">Rerender Vue</button>
  </form>
</template>
