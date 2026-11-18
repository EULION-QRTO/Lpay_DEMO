// 데모 앱에는 백엔드가 없다 — HTTP 코어는 제거되고, 화면들이 에러를 구분하는 데 쓰는 ApiError 만 남겼다.
// (데모 서버 demoServer.ts 와 토스 연동 toss.ts 가 실패 시 이 에러를 throw 한다.)
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 0,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
