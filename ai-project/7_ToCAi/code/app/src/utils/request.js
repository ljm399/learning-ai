import axios from 'axios';

const request = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
});

request.interceptors.request.use(
  (config) => {
    if (!config.url.includes('/login')) {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

request.interceptors.response.use(
  (response) => {
    const data = response.data;

    if (data.code === 401) {

      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    if (data.success === false || (data.code && data.code !== 200)) {
      console.error('请求错误:', data.message || '未知错误');
    }
    return data;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    console.error('网络或服务器错误:', error.message);
    return Promise.reject(error);
  }
);

export default request;
