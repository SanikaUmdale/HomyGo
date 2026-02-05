// routes/listing.js
const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");

// Mapbox geocoding
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const geocoder = mbxGeocoding({ accessToken: process.env.MAPBOX_TOKEN });

// Helper middleware to get multer upload instance from app.locals and run single('image')
function uploadSingleMiddleware(req, res, next) {
  const upload = req.app.locals.upload;
  if (!upload) {
    return next(new Error("Upload middleware is not configured on app.locals.upload"));
  }
  upload.single("image")(req, res, function (err) {
    if (err) return next(err);
    next();
  });
}

// Helper middleware to flatten nested listing[...] inputs to top-level req.body
function flattenListingBody(req, res, next) {
  if (req.body && req.body.listing && typeof req.body.listing === "object") {
    req.body = { ...req.body, ...req.body.listing };
    delete req.body.listing;
  }
  next();
}

/* -----------------------
   ROUTES
   ----------------------- */

// Index - list all listings
router.get("/", async (req, res, next) => {
  try {
    const listings = await Listing.find({});
    res.render("listings/index", { listings });
  } catch (err) {
    next(err);
  }
});

// New - show form
router.get("/new", (req, res) => {
  res.render("listings/new", { listing: {} });
});

// Create - handle form submit (with file upload + Mapbox geocode)
router.post(
  "/",
  uploadSingleMiddleware,
  flattenListingBody,
  async (req, res, next) => {
    try {
      // Build listing data from req.body
      const listingData = { ...req.body };

      // If file uploaded, set image object {url, filename}
      if (req.file && req.file.filename) {
        // store a relative public path that your static middleware will serve
        listingData.image = {
          url: "/uploads/" + req.file.filename,
          filename: req.file.filename
        };
      }

      // Attach owner if user logged in
      if (req.user && req.user._id) {
        listingData.owner = req.user._id;
      }

      // --- Mapbox geocoding: convert location string to GeoJSON geometry ---
      try {
        if (listingData.location && typeof listingData.location === 'string' && listingData.location.trim().length > 0) {
          const geoRes = await geocoder
            .forwardGeocode({
              query: listingData.location,
              limit: 1
            })
            .send();

          if (geoRes && geoRes.body && geoRes.body.features && geoRes.body.features.length > 0) {
            listingData.geometry = geoRes.body.features[0].geometry;
          } else {
            listingData.geometry = { type: 'Point', coordinates: [0, 0] };
          }
        } else {
          // your schema requires geometry; provide a safe fallback
          listingData.geometry = { type: 'Point', coordinates: [0, 0] };
        }
      } catch (geoErr) {
        console.error("Geocoding error:", geoErr);
        listingData.geometry = { type: 'Point', coordinates: [0, 0] };
      }

      // Create and save
      const listing = new Listing(listingData);
      await listing.save();

      req.flash("success", "Listing created successfully");
      res.redirect(`/listings/${listing._id}`);
    } catch (err) {
      console.error(err);
      const errors = err.errors || null;
      res.status(400).render("listings/new", {
        listing: req.body || {},
        errors,
      });
    }
  }
);

// Show - single listing (populate owner and review authors)
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id)
      .populate('owner')
      .populate({
        path: 'reviews',
        populate: { path: 'author' }
      });

    if (!listing) {
      req.flash("error", "Listing not found");
      return res.redirect("/listings");
    }

    // pass currUser to template if you want to check ownership in EJS
    res.render("listings/show", { listing, currUser: req.user });
  } catch (err) {
    next(err);
  }
});

// Edit form
router.get("/:id/edit", async (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
      req.flash("error", "Listing not found");
      return res.redirect("/listings");
    }
    res.render("listings/edit", { listing });
  } catch (err) {
    next(err);
  }
});

// Update - allow updating listing plus optional new image (and re-geocode if location changed)
router.put(
  "/:id",
  uploadSingleMiddleware,
  flattenListingBody,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const listingData = { ...req.body };

      // If new file uploaded, overwrite image object
      if (req.file && req.file.filename) {
        listingData.image = {
          url: "/uploads/" + req.file.filename,
          filename: req.file.filename
        };
      }

      // Optionally re-geocode if location changed
      if (listingData.location && typeof listingData.location === 'string') {
        try {
          const geoRes = await geocoder
            .forwardGeocode({ query: listingData.location, limit: 1 })
            .send();
          if (geoRes.body.features && geoRes.body.features.length > 0) {
            listingData.geometry = geoRes.body.features[0].geometry;
          }
        } catch (gErr) {
          console.error("Geocoding error on update:", gErr);
        }
      }

      const updated = await Listing.findByIdAndUpdate(id, listingData, {
        new: true,
        runValidators: true,
      });

      req.flash("success", "Listing updated");
      res.redirect(`/listings/${updated._id}`);
    } catch (err) {
      console.error(err);
      next(err);
    }
  }
);

// Delete
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing deleted");
    res.redirect("/listings");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
