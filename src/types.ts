import { Request } from "express";

interface AuthenticatedRequest extends Request {
	memberInfo: MemberInfo
}

type MemberInfo = {
	browser_id?: string,
} & ({
	signedIn: true,
	user_id: number,
	username: string,
	roles: string[] | null
} | {
	signedIn: false
})

/**
 * @type {MemberInfo}, but the browser_id is guaranteed to be defined.
 * This means the user is fully authenticated, cause we only need one
 * identifier to identify them.
 */
type AuthMemberInfo = MemberInfo & { browser_id: string }

export type {
	AuthenticatedRequest,
	MemberInfo,
	AuthMemberInfo
};