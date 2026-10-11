import request from '../utils/request.js';

export function login(data) {
  return request({
    url: '/api/login',
    method: 'post',
    data,
  });
}
