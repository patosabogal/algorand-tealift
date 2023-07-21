export function* enumerate<T>(iterable: Iterable<T>): Iterable<[T, number]> {
	let i = 0;
	for (const v of iterable)
		yield [v, i++];
}
export function* zip<A, B>(xs: Iterable<A>, ys: Iterable<B>): Iterable<[A, B]> {
	const it = ys[Symbol.iterator]();
	for (const x of xs) {
		const { done, value: y } = it.next();
		if (done)
			return;
		yield [x, y];
	}
}
export function range(to: number): Iterable<number>;
export function range(from: number, to: number): Iterable<number>;
export function range(from: number, to: number, step: number): Iterable<number>;
export function* range(from: number, to?: number, step?: number) {
	if (to === undefined)
		[to, from] = [from, 0];
	if (step === undefined)
		step = 1;
	for (let i = from; i < to; i += step)
		yield i;
}

export const get_list = <K, V>(map: Map<K, V[]>, key: K): V[] => {
	let result = map.get(key);
	if (result === undefined) {
		result = [];
		map.set(key, result);
	}
	return result;
};
