import { Request } from "express";

interface CustomRequest extends Request {
	memberInfo: MemberInfo
}

type MemberInfo = {
	signedIn: true,
	user_id: number,
	username: string,
	roles: string[]
} | {
	signedIn: false
}

export type {
	CustomRequest,
	MemberInfo
};