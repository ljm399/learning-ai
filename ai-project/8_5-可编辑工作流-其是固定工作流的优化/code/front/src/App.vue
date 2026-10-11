<template>
  <div class="app-container">
    <nav class="nav-bar">
      <router-link to="/" class="nav-link" active-class="active">对话</router-link>
      <router-link to="/flow-editor" class="nav-link" active-class="active">工作流编辑</router-link>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.nav-bar {
  display: flex;
  gap: 8px;
  padding: 12px 24px;
  background: white;
  border-bottom: 1px solid #e5e5e5;
}

.nav-link {
  padding: 8px 20px;
  text-decoration: none;
  color: #333;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-link:hover {
  background: #f0f0f0;
}

.nav-link.active {
  background: #1677ff;
  color: white;
}

.main-content {
  flex: 1;
  overflow: hidden;
}
</style>
