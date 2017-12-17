const knex = require('../../database/knex');
const moment = require('moment');
const datesBetween = require('dates-between');
const Promise = require('bluebird');

const isConflict = require('./isConflict');

const makeBooking = (req, res) => {
  const { listingId, userId, price } = req.body;

  const startDate = new Date(req.body.startDate);
  const endDate = new Date(req.body.endDate);

  const requestedDates = [];

  // get all dates between requested dates
  for (const date of datesBetween(startDate, endDate)) {
    const newDate = moment(date).format('L');
    requestedDates.push(newDate);
  }
  // get date ids from "dates" table for requested booking dates
  knex.select('id').from('dates').whereIn('date', requestedDates).then((requestedDatesIds) => {
    // look up date ids for the listings actual bookings
    knex.select('date_id').from('bookings').where({ listing_id: listingId })
      .then((bookedDatesIds) => {
        // check for conflicts between requested dates and already booked dates
        if (isConflict(requestedDatesIds, bookedDatesIds)) {
          // if there is a conflict, send error
          res.status(409).send('booking conflict');
        } else {
          // if there is no conflict, insert all booking dates (ids) with a transaction
          knex.transaction((trx) => {
            return knex('bookings')
              // start transaction
              .transacting(trx)
              // map over all requested dates and save the bookings
              .then(() => {
                return Promise.map(requestedDatesIds, (date) => {
                  return trx.insert({
                    date_id: date.id,
                    listing_id: listingId,
                    user_id: userId,
                    price,
                  }).into('bookings');
                });
              })
              .then(trx.commit)
              .catch(trx.rollback);
          })
            .then((inserts) => {
              console.log(`${inserts.length} new booking dates saved.`);
              res.json({
                listingId,
                userId,
                price,
                startDate: req.body.startDate,
                endDate: req.body.endDate,
              });
            })
            .catch((error) => {
              console.error(error);
              res.status(409).send('no conflicts, but booking was still unsuccesfull');
            });
        }
      });
  });
};

module.exports = makeBooking;
