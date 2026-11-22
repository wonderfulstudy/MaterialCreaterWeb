# 「我的」页 微信登录 接口契约（冻结版 v1）

> 状态：**已冻结**，前端按本文实现；后端（MaterialCreaterServer）本期不实现，留待下个迭代。
> 冻结日期：2026-11-21 · 拥有者：Lead · 变更需重新走评审，前端不得擅自改字段名。

## 0. 事实边界（决策依据，不可协商）

1. 小程序内没有"登录个人微信号"的官方能力。唯一可用的身份获取是 `wx.login` 拿到一次性 `code`，由服务端调
   `https://api.weixin.qq.com/sns/jscode2session` 换 `openid`。前端**永不持有 AppSecret**。
2. 个人微信「我的二维码名片」无法通过任何官方接口获取（隐私限制），只能由用户本人从相册提供图片。
   因此本契约**不含**"获取用户微信二维码"接口；二维码图片本期只存设备本地。

## 1. 通用约定

| 项 | 约定 |
| --- | --- |
| BaseURL | 前端 `AppConfig.app.api_base_url`（`src/config/app.ts`），空字符串表示未配置 |
| Mock 开关 | `AppConfig.app.auth_mock === true` 时前端不发请求，返回 `MOCK_LOGIN_RESPONSE` |
| 编码 | `application/json; charset=utf-8` |
| 鉴权头 | `Authorization: Bearer <token>` |
| 成功体 | 直接返回业务对象，不包裹 `{code,data}` |
| 失败体 | `{ "code": "wx_code_invalid", "message": "登录凭证已失效" }`，HTTP 状态与 code 同时表达语义 |
| 时间 | 一律毫秒时间戳（number） |

## 2. 错误码

| HTTP | code | 含义 | 前端处理 |
| --- | --- | --- | --- |
| 400 | `invalid_payload` | 缺少 code 或格式错误 | 提示"登录失败，请重试" |
| 401 | `wx_code_invalid` | 微信返回 40029（code 无效/已用） | 静默重试一次 `wx.login` |
| 401 | `session_expired` | token 过期或签名校验失败 | 清本地会话，重新静默登录 |
| 429 | `rate_limited` | 触发频控 | 提示稍后再试 |
| 502 | `wx_upstream_error` | 微信侧 5xx/超时 | 提示"微信服务异常" |
| 500 | `internal_error` | 其他 | 提示"服务异常" |

## 3. POST /api/auth/login

请求：

```json
{ "code": "081Abc000xyz", "nickname": "老王彩店", "avatarUrl": "https://thirdwx.qlogo.cn/..." }
```

`nickname` / `avatarUrl` 可选，来自微信「头像昵称填写能力」，服务端落库时为空则保留旧值。

响应 200：

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": 1764000000000,
  "user": {
    "openid": "oX7bH5abcdefghijklmn",
    "unionid": "",
    "nickname": "老王彩店",
    "avatarUrl": "https://thirdwx.qlogo.cn/...",
    "createdAt": 1763000000000,
    "updatedAt": 1763900000000
  }
}
```

## 4. GET /api/auth/me

请求头带 `Authorization`。响应 200：`user` 对象（同第 3 节）。401 `session_expired` 时前端清会话重登。

## 5. PUT /api/user/profile

请求：`{ "nickname": "老王彩店", "avatarUrl": "https://..." }`（字段均可选，缺省不改）。响应 200：更新后的 `user`。

## 6. 预留（本期前端不实现调用，仅占位）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/user/wechat-qr` | multipart `file`；返回 `{ "url": "https://..." }`，为下个迭代的跨设备同步 |
| GET | `/api/user/wechat-qr` | 返回 `{ "url": "" }` |

## 7. 前端实现约定（本契约的一部分）

| 项 | 约定 |
| --- | --- |
| 会话存储键 | `mc.auth.session.v1`（`{ token, expiresAt, user }`） |
| 二维码存储键 | `mc.wechat.qr.v1`（微信端存 `wx.env.USER_DATA_PATH/wechat-qr.png` 的路径字符串；H5 存 dataURL） |
| 登录时机 | `useDidShow` 首次进入静默登录；失败不阻塞页面，身份卡显示"未登录 + 重试" |
| openid 展示 | 仅展示后 6 位（mock openid `mock-openid-000001jklmn` → `…1jklmn`），永不整串显示；尾号位数以 6 为准 |

```json
// MOCK_LOGIN_RESPONSE（auth_mock: true 时返回）
{
  "token": "mock-token",
  "expiresAt": 1893456000000,
  "user": {
    "openid": "mock-openid-000001jklmn",
    "unionid": "",
    "nickname": "",
    "avatarUrl": "",
    "createdAt": 1763000000000,
    "updatedAt": 1763000000000
  }
}
```

## 8. 后端实现要点（下个迭代照此落地）

- 环境变量：`WX_APPID`、`WX_SECRET`、`AUTH_SECRET`；`WX_SECRET` 不得进仓库。
- code2Session：`GET https://api.weixin.qq.com/sns/jscode2session?appid=&secret=&js_code=&grant_type=authorization_code`，
  注意它在 HTTP 200 里用 `errcode` 报错（40029 code 无效、45011 频控）。
- token 建议：`base64url(payload) + "." + HMAC-SHA256(payload, AUTH_SECRET)`，payload 含 `openid`、`exp`。
- 表结构（MySQL 8 / gorm）：

```sql
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `openid` VARCHAR(64) NOT NULL,
  `unionid` VARCHAR(64) NOT NULL DEFAULT '',
  `nickname` VARCHAR(64) NOT NULL DEFAULT '',
  `avatar_url` VARCHAR(512) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
