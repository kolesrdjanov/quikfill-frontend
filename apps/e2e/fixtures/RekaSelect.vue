<script setup lang="ts">
import { ref } from 'vue'
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
} from 'reka-ui'
const choice = ref('')
const tick = ref(0)
</script>
<template>
  <form :data-choice="choice" :data-tick="tick">
    <input name="email" type="email" />
    <div id="reka-choice">
      <SelectRoot v-model="choice" name="choice">
        <SelectTrigger aria-label="Choice"><SelectValue placeholder="Choose role" /></SelectTrigger>
        <SelectPortal
          ><SelectContent position="popper"
            ><SelectViewport
              ><SelectItem value="chosen"
                ><SelectItemText>Editor</SelectItemText></SelectItem
              ></SelectViewport
            ></SelectContent
          ></SelectPortal
        >
      </SelectRoot>
    </div>
    <button type="button" @click="tick++">Rerender widgets</button>
  </form>
</template>
