export interface DataSource<TInput = unknown, TOutput = unknown> {
  id: string;
  name: string;
  fetch(input: TInput): Promise<TOutput>;
}

export interface EntityMapper<TDto = unknown, TDb = unknown> {
  id: string;
  toDb(dto: TDto): TDb;
  fromDb(db: TDb): TDto;
}

export interface StatCalculator<TParams = unknown, TResult = unknown> {
  id: string;
  name: string;
  compute(params: TParams): TResult;
}
