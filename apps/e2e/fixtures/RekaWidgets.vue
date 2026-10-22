<script setup lang="ts">
import { ref } from 'vue'
import { CheckboxRoot, SwitchRoot } from 'reka-ui'
const checked = ref(false)
const enabled = ref(false)
const tick = ref(0)
</script>
<template>
  <form :data-checked="checked" :data-enabled="enabled" :data-tick="tick">
    <CheckboxRoot v-model="checked" name="terms" required aria-label="Terms">Terms</CheckboxRoot>
    <SwitchRoot v-model="enabled" name="updates" required aria-label="Updates">Updates</SwitchRoot>
    <button type="button" @click="tick++">Rerender widgets</button>
  </form>
</template>
