export const enum HTTPCodes {
  OK = 200,

  BadRequest = 400,
  Forbidden = 403,
  NotFound = 404,
}

export const enum WebsocketCodes {
  Normal = 1000,
  GoingAway = 1001,
  UnsupportedData = 1003,
  PolicyViolation = 1008,
  TryAgainLater = 1013,
}
