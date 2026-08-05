locals {
  # Keep `region` a single knob: default the zone to <region>-b unless the zone
  # is explicitly overridden, so changing the region alone can't leave the VM
  # stranded in a zone of a different region.
  zone = var.zone != "" ? var.zone : "${var.region}-b"
}
