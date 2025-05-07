export interface TweetSummary {
    text: string
    createdAt: Date | string | number
}

export interface TrendSummary {
    text: string
    createdAt: Date | string | number
}

export interface PersonalizedTrendSummary {
    text: string
    createdAt: Date | string | number
}

export interface ErrorResponseData {
    code: number
    message: string
}

export interface ResponseData {
    data: TweetSummary | TrendSummary | PersonalizedTrendSummary | null
    error: ErrorResponseData | null
}

export interface SendTweetsResponse{A
    next: boolean | null
    error: ErrorResponseData | null
}
