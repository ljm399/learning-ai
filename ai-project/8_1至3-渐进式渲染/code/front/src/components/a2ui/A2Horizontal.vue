<template>
  <div class="a2-horizontal">
    <slot></slot>
  </div>
</template>

<script setup>
</script>

<style scoped>
.a2-horizontal {
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: flex-start;
}
</style>
