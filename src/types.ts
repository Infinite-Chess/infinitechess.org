import { Request } from "express";

interface AuthenticatedRequest extends Request {
	memberInfo: MemberInfo
}

type MemberInfo = {
	signedIn: true,
	user_id: number,
	username: string,
	roles: string[] | null
} | {
	signedIn: false
}

export type {
	AuthenticatedRequest,
	MemberInfo
};