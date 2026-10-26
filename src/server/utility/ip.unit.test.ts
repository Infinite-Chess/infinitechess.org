// src/server/utility/ip.unit.test.ts

/**
 * Pins which addresses share a network: an IPv4 address alone, and every IPv6 address of one /64,
 * however it is written.
 */

import { describe, it, expect } from 'vitest';

import ip from './ip.js';

describe('ip.networkOf', () => {
	it('keeps an IPv4 address whole, including one mapped into IPv6', () => {
		expect(ip.networkOf('203.0.113.7')).toBe('203.0.113.7');
		expect(ip.networkOf('::ffff:203.0.113.7')).toBe('203.0.113.7');
	});

	it('puts two devices of one IPv6 /64 on the same network, however their addresses are written', () => {
		const laptop = ip.networkOf('2001:db8:85a3:12::8a2e:370:7334');
		const phone = ip.networkOf('2001:0DB8:85A3:0012:abcd:1:2:3%en0');
		expect(laptop).toBe(phone);
		expect(ip.networkOf('2001:db8:85a3:13::1')).not.toBe(laptop);
		expect(ip.networkOf('::1')).toBe(ip.networkOf('0:0:0:0:ffff::2'));
	});
});
