// Plugin without default export
export const namedExport = function(fastify, options) {
  fastify.decorate('namedPlugin', 'working');
};

export const anotherExport = {
  value: 'not a function'
};