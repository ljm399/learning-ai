<template>
  <div class="a2-vertical">
    <slot></slot>
  </div>
</template>

<script setup>
</script>

<style scoped>
.a2-vertical {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
</style>
