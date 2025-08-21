const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync.js");
const ExpressError = require("../utils/ExpressError.js");
const Review = require("../models/review.js");
const{validateReview, isLoggedIn,isReviewAuthor}=require("../middleware.js")
const Listing = require("../models/listing.js");



//  reviews
router.post(
  "/",
  isLoggedIn,
  validateReview,
  wrapAsync(async (req, res) => {
    let listing = await Listing.findById(req.params.id);
    let newReview = new Review(req.body.review);
    newReview.author=req.user._id;
    // console.log(newReview);
     
    listing.reviews.push(newReview);

    await newReview.save();
    await listing.save();
    req.flash("success", "New Review Is Created!");

    res.redirect(`/listings/${listing._id}`);
    // console.log("new review saved");
    // res.send("New Review saved..!");
  })
);
//Delete route =>reviews
router.delete(
  "/:reviewId",
  isLoggedIn,
  isReviewAuthor,
  wrapAsync(async (req, res) => {
    let { id, reviewId } = req.params;
    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review Is Deleted!");
    res.redirect(`/listings/${id}`);
  })
);

module.exports = router;
