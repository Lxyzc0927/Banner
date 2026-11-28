'use strict';

const { optionalUser } = require('../../middleware');
const { asObject, string, integer } = require('../../validate');
const { recordEvent } = require('./events');

const EVENT_ACTIONS = new Set([
  'view',
  'signup_click',
  'bike_sort',
  'bike_price_filter',
  'bike_tag_filter',
]);

const VIEW_MODULES = {
  home: { module: 'home', page: 'home' },
  bike: { module: 'bike', page: 'bike_list' },
  bike_detail: { module: 'bike', page: 'bike_detail', target: 'bikeId' },
  activity: { module: 'activity', page: 'activity_list' },
  activity_detail: { module: 'activity', page: 'activity_detail', target: 'activityId' },
  mine: { module: 'mine', page: 'mine' },
  chat: { module: 'chat', page: 'chat' },
};

function mapEvent(body) {
  const event = string(body.event, 'event', { required: true, max: 40 });
  if (!EVENT_ACTIONS.has(event)) return null;

  if (event === 'view') {
    const view = VIEW_MODULES[body.module];
    if (!view) return null;
    return {
      action: 'view',
      module: view.module,
      page: view.page,
      targetId: view.target ? integer(body[view.target], view.target, { min: 1, defaultValue: null }) : null,
    };
  }

  if (event === 'signup_click') {
    return {
      action: event,
      module: 'activity',
      page: 'activity_detail',
      targetId: integer(body.activityId, 'activityId', { min: 1, defaultValue: null }),
    };
  }

  return {
    action: event,
    module: 'bike',
    page: 'bike_list',
    targetId: null,
  };
}

function register(router) {
  router.post('/api/track', optionalUser, (ctx) => {
    const body = asObject(ctx.body || {});
    const mapped = mapEvent(body);
    if (!mapped) return ctx.ok({ tracked: false });

    const eventId = recordEvent(ctx, mapped, body);
    ctx.ok({ tracked: true, eventId });
  });
}

module.exports = { register, mapEvent };
