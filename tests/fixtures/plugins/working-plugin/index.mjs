// Working test plugin
export default function workingPlugin(fastify, options) {
  fastify.decorate('testPlugin', 'working');
}