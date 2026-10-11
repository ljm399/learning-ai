<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../api/login.js'

const router = useRouter()
const username = ref('')
const password = ref('')

async function handleLogin() {
  const res = await login({ username: username.value, password: password.value })
  if (res.data && res.data.token) {
    localStorage.setItem('token', res.data.token)
    router.push('/chat')
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <h2>登录</h2>
      <div class="form-item">
        <input v-model="username" type="text" placeholder="账号" />
      </div>
      <div class="form-item">
        <input v-model="password" type="password" placeholder="密码" />
      </div>
      <button class="login-btn" @click="handleLogin">登录</button>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f5f5f5;
}

.login-box {
  width: 360px;
  padding: 40px 32px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.login-box h2 {
  margin: 0 0 24px;
  text-align: center;
  font-size: 22px;
  color: #333;
}

.form-item {
  margin-bottom: 16px;
}

.form-item input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #dcdcdc;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-item input:focus {
  outline: none;
  border-color: #409eff;
}

.login-btn {
  width: 100%;
  height: 40px;
  margin-top: 8px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  cursor: pointer;
}

.login-btn:hover {
  background: #66b1ff;
}
</style>
