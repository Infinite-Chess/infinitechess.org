import { Request } from "express";

interface AuthenticatedRequest extends Request {
	memberInfo: MemberInfo
}

type MemberInfo = {
	browser_id: string,
} & ({
	signedIn: true,
	user_id: number,
	username: string,
	roles: string[] | null
} | {
	signedIn: false
})

export type {
	AuthenticatedRequest,
	MemberInfo
};